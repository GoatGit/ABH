import type {ActionView} from '@abh/contracts';

export const lifecycleLabels:Record<ActionView['position']['lifecycle'],string>={
  Proposed:'已提议',Validated:'已验证',Authorized:'已授权',Executing:'执行中',
  Reconciling:'对账中',Closed:'已关闭',Rejected:'已拒绝',Expired:'已过期',Cancelled:'已取消',
};

const outcomeLabels:Record<ActionView['position']['outcome'],string>={
  NotStarted:'未开始',Pending:'等待结果',Unknown:'结果待确认',
  Succeeded:'成功',PartiallySucceeded:'部分成功',Failed:'失败',
};

export function actionPositionLabel(position:ActionView['position']):string{
  return `${lifecycleLabels[position.lifecycle]} · ${outcomeLabels[position.outcome]}`;
}

export function canCancelAction(action:ActionView):boolean{
  return action.availableActions.includes('abh.actions.cancel');
}
