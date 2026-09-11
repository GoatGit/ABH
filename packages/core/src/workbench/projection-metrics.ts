export type ProjectionSseDropReason='slow'|'reset'|'disconnected';

export interface ProjectionMetrics {
  observeProjectionLag(valueMs:number):void;
  observeGapCount(value:number):void;
  incrementRebuildFailure():void;
  incrementSseDrop(reason:ProjectionSseDropReason):void;
  incrementQueryRedaction():void;
}

export interface ProjectionMetricsSnapshot {
  readonly projectionLagMs:number|null;
  readonly gapCount:number|null;
  readonly rebuildFailure:number;
  readonly sseDrop:Readonly<Record<ProjectionSseDropReason,number>>;
  readonly queryRedactionCount:number;
}

/** Fixed series only. Object, actor and organization identifiers never become metric labels. */
export class ProjectionMetricsCollector implements ProjectionMetrics {
  #projectionLagMs:number|null=null;
  #gapCount:number|null=null;
  #rebuildFailure=0;
  #sseDrop:Record<ProjectionSseDropReason,number>={slow:0,reset:0,disconnected:0};
  #queryRedactionCount=0;

  #counter(value:number,name:string):number{
    if(!Number.isSafeInteger(value)||value<0)throw new TypeError(`Invalid ${name} metric`);
    return value;
  }

  observeProjectionLag(valueMs:number):void{
    if(!Number.isSafeInteger(valueMs)||valueMs<0)throw new TypeError('Invalid projection lag metric');
    this.#projectionLagMs=valueMs;
  }

  observeGapCount(value:number):void{
    this.#gapCount=this.#counter(value,'projection gap');
  }

  incrementRebuildFailure():void{
    this.#rebuildFailure=this.#counter(this.#rebuildFailure+1,'rebuild failure');
  }

  incrementSseDrop(reason:ProjectionSseDropReason):void{
    this.#sseDrop[reason]=this.#counter(this.#sseDrop[reason]+1,'SSE drop');
  }

  incrementQueryRedaction():void{
    this.#queryRedactionCount=this.#counter(this.#queryRedactionCount+1,'query redaction');
  }

  snapshot():ProjectionMetricsSnapshot{
    return {
      projectionLagMs:this.#projectionLagMs,
      gapCount:this.#gapCount,
      rebuildFailure:this.#rebuildFailure,
      sseDrop:{...this.#sseDrop},
      queryRedactionCount:this.#queryRedactionCount,
    };
  }
}

/** Metric failures must not turn a healthy business or recovery path into an incident. */
export function recordProjectionMetric(metrics:ProjectionMetrics|undefined,
  operation:(metrics:ProjectionMetrics)=>void):void{
  try{metrics&&operation(metrics);}catch{}
}
