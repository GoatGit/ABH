import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ProjectionMetricsCollector,recordProjectionMetric} from '../src/workbench/projection-metrics.ts';

test('projection metrics keep fixed series and reject unbounded cardinality inputs',()=>{
 const metrics=new ProjectionMetricsCollector();
 metrics.observeProjectionLag(1250);
 metrics.observeGapCount(2);
 metrics.incrementRebuildFailure();
 metrics.incrementSseDrop('slow');
 metrics.incrementSseDrop('reset');
 metrics.incrementQueryRedaction();
 assert.deepEqual(metrics.snapshot(),{
  projectionLagMs:1250,gapCount:2,rebuildFailure:1,
  sseDrop:{slow:1,reset:1,disconnected:0},queryRedactionCount:1});
 for(const invalid of [-1,1.5,Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>metrics.observeGapCount(invalid),TypeError);
 assert.throws(()=>metrics.incrementSseDrop('unknown' as 'slow'),TypeError);
});

test('projection work survives a failing metric exporter',()=>{
 const metrics=new ProjectionMetricsCollector();
 recordProjectionMetric(metrics,()=>{throw new TypeError('exporter unavailable');});
 metrics.observeGapCount(0);
 assert.equal(metrics.snapshot().gapCount,0);
});
