import {CoreError} from '../internal/errors.ts';
import type {TransactionOptions} from './uow.ts';

/** All pool users enter here; cancellation removes the waiter before any SQL is issued. */
export class ConnectionAdmission {
  #active=0;
  #limit:number;
  #closed=false;
  #waiting=new Set<{grant():void;reject():void}>();
  constructor(limit:number){this.#limit=limit;}
  async acquire(options:TransactionOptions):Promise<()=>void>{
    if(this.#closed)throw new CoreError('PRECONDITION_FAILED');
    if(!Number.isFinite(options.deadline)||options.deadline<=Date.now()||options.signal.aborted)throw new CoreError('DEPENDENCY_TIMEOUT');
    if(this.#active<this.#limit){this.#active++;return this.#release();}
    if(this.#waiting.size>=1000)throw new CoreError('LIMIT_EXCEEDED');
    return new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);options.signal.removeEventListener('abort',abort);this.#waiting.delete(waiter);};
      const abort=()=>{cleanup();reject(new CoreError('DEPENDENCY_TIMEOUT'));};
      const waiter={grant:()=>{
        cleanup();
        if(options.signal.aborted||options.deadline<=Date.now()){reject(new CoreError('DEPENDENCY_TIMEOUT'));return;}
        this.#active++;resolve(this.#release());
      },reject:()=>{cleanup();reject(new CoreError('PRECONDITION_FAILED'));}};
      const timer=setTimeout(abort,Math.max(1,Math.min(2147483647,options.deadline-Date.now())));
      this.#waiting.add(waiter);options.signal.addEventListener('abort',abort,{once:true});
    });
  }
  close():void{this.#closed=true;for(const waiter of this.#waiting)waiter.reject();}
  #release():()=>void{
    let released=false;
    return ()=>{
      if(released)return;released=true;this.#active--;
      while(!this.#closed&&this.#active<this.#limit&&this.#waiting.size)this.#waiting.values().next().value!.grant();
    };
  }
}
