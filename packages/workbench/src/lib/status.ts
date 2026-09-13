/** Status-to-visual-tone mapping for badges. Pure data so tests can pin it; unknown
 *  statuses fall back to the neutral tone instead of guessing. */
export type StatusTone='ok'|'info'|'warn'|'danger'|'neutral';

const TONES:Record<string,StatusTone>={
  // Running / accepted / healthy
  Active:'ok',Approved:'ok',Pass:'ok',Completed:'ok',Enabled:'ok',Accepted:'ok',
  Applied:'ok',Settled:'ok',Released:'ok',Published:'ok',Closed:'neutral',
  // In progress / waiting on the system
  Draft:'neutral',Staged:'neutral',Pending:'info',Queued:'info',Running:'info',
  Connecting:'info',Reconciling:'info',Dispatched:'info',Requested:'info',
  InFlight:'info',Suspended:'warn',Paused:'warn',Waiting:'warn',Blocked:'warn',
  Inconclusive:'warn',NeedsResponsibility:'warn',Observing:'info',
  // Terminal failure / reversal
  Failed:'danger',Rejected:'danger',Cancelled:'danger',Revoked:'danger',
  Expired:'danger',Unknown:'danger',Abandoned:'danger',Retired:'neutral',
};

export function statusTone(status:string|undefined|null):StatusTone{
  if(!status)return 'neutral';
  return TONES[status]??'neutral';
}
