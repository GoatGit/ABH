'use client';

import {useEffect,useRef,useState} from 'react';
import {projectionEventPathWithCursor,type ProjectionSubjectType} from '@/lib/query-keys';

export type LiveStreamState='connecting'|'live'|'reset'|'disabled';

const BASE_RECONNECT_MS=500,MAX_RECONNECT_MS=8_000;

/** One EventSource per subject: Last-Event-ID resume, exponential backoff that resets on a
 *  healthy open, and reset handling delegated to the caller. Callbacks are kept in a ref so
 *  callers can pass inline closures without resubscribing. */
export function useProjectionStream(subject:{type:ProjectionSubjectType;id:string}|undefined,
  onChanged:()=>void,onReset:()=>void,sseEnabled=true):LiveStreamState{
  const [streamState,setStreamState]=useState<LiveStreamState>(
    !sseEnabled||!subject?'disabled':'connecting');
  const callbacks=useRef({onChanged,onReset});
  useEffect(()=>{callbacks.current={onChanged,onReset};});
  const subjectType=subject?.type,subjectId=subject?.id;
  useEffect(()=>{
    if(!sseEnabled||!subjectType||!subjectId){setStreamState('disabled');return;}
    let lastEventId='',source:EventSource|undefined,reconnectTimer:number|undefined,closed=false;
    let reconnectDelay=BASE_RECONNECT_MS;
    const connect=()=>{
      source=new EventSource(projectionEventPathWithCursor(subjectType,subjectId,lastEventId));
      source.addEventListener('projection_changed',event=>{
        lastEventId=(event as MessageEvent).lastEventId||lastEventId;
        reconnectDelay=BASE_RECONNECT_MS;
        setStreamState('live');
        callbacks.current.onChanged();
      });
      source.addEventListener('projection_reset',()=>{
        setStreamState('reset');
        callbacks.current.onReset();
        source?.close();
      });
      source.onopen=()=>{
        reconnectDelay=BASE_RECONNECT_MS;
        setStreamState('live');
        callbacks.current.onChanged();
      };
      source.onerror=()=>{
        setStreamState(current=>current==='reset'?'reset':'connecting');
        if(source?.readyState===EventSource.CLOSED&&!closed){
          reconnectTimer=window.setTimeout(connect,reconnectDelay);
          reconnectDelay=Math.min(MAX_RECONNECT_MS,reconnectDelay*2);
        }
      };
    };
    connect();
    return()=>{closed=true;window.clearTimeout(reconnectTimer);source?.close();};
  },[sseEnabled,subjectType,subjectId]);
  return streamState;
}
