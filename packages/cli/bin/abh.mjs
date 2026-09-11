#!/usr/bin/env node
import {runDoctor} from '../src/doctor.mjs';
import {runMission} from '../src/mission.mjs';
import {runServer} from '../src/run.mjs';
const stop=new AbortController();
const cancel=()=>stop.abort();
process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
const args=process.argv.slice(2);
try{
 if(args[0]==='mission'){process.exitCode=await runMission(args.slice(1),{env:process.env,stdout:process.stdout,stderr:process.stderr});}
 else if(args[0]==='run'){process.exitCode=await runServer(args.slice(1),{env:process.env,stdout:process.stdout,stderr:process.stderr,signal:stop.signal});}
 else{process.exitCode=await runDoctor(args,{env:process.env,stdout:process.stdout,stderr:process.stderr,signal:stop.signal});}
}
catch{process.stderr.write('abh: DEPENDENCY_UNAVAILABLE\n');process.exitCode=6;}
finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
