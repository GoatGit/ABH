/** Localizes Ajv default validation messages for JSON Forms. Text that does not match a
 *  known English pattern (labels, custom messages) passes through unchanged. */

const PATTERNS:readonly {pattern:RegExp;message:(...groups:string[])=>string}[]=[
  {pattern:/^must have required property '(.+)'$/u,
    message:property=>`「${property}」为必填`},
  {pattern:/^must NOT have fewer than (\d+) characters$/u,
    message:min=>`至少需要 ${min} 个字符`},
  {pattern:/^must NOT have more than (\d+) characters$/u,
    message:max=>`最多允许 ${max} 个字符`},
  {pattern:/^must NOT be shorter than (\d+)$/u,message:min=>`不能小于 ${min}`},
  {pattern:/^must NOT be longer than (\d+)$/u,message:max=>`不能大于 ${max}`},
  {pattern:/^must match pattern "(.+)"$/u,message:()=>'格式不正确'},
  {pattern:/^must be (string|number|integer|boolean|array|object|null)$/u,
    message:kind=>`必须是${({string:'字符串',number:'数字',integer:'整数',boolean:'布尔值',
      array:'数组',object:'对象',null:'空值'} as Record<string,string>)[kind]??kind}`},
  {pattern:/^must NOT have additional properties$/u,message:()=>'包含未定义的字段'},
  {pattern:/^must be >= (\S+)$/u,message:min=>`不能小于 ${min}`},
  {pattern:/^must be <= (\S+)$/u,message:max=>`不能大于 ${max}`},
  {pattern:/^must be exactly equal to (.+)$/u,message:value=>`必须为 ${value}`},
  {pattern:/^must match exactly one schema in oneOf$/u,message:()=>'不满足任一允许的格式'},
  {pattern:/^must match a schema in anyOf$/u,message:()=>'不满足允许的格式'},
  {pattern:/^must NOT be valid$/u,message:()=>'取值不被允许'},
  {pattern:/^must be unique$/u,message:()=>'不能重复'},
];

export function localizeValidationMessage(message:string):string{
  for(const {pattern,message:render} of PATTERNS){
    const match=pattern.exec(message);
    if(match)return render(...match.slice(1));
  }
  return message;
}

/** JSON Forms i18n hook: validation errors are localized, every other string passes through. */
export function translateJsonFormsText(errorId:string,
  defaultMessage?:string|{defaultMessage?:unknown}):string|undefined{
  void errorId;
  if(typeof defaultMessage==='string')return localizeValidationMessage(defaultMessage);
  if(defaultMessage&&typeof defaultMessage==='object'
    &&typeof defaultMessage.defaultMessage==='string'){
    return localizeValidationMessage(defaultMessage.defaultMessage);
  }
  return undefined;
}

type I18nState=import('@jsonforms/core').JsonFormsI18nState;

/** Ajv ErrorObject message localization; keeps the i18n contract of JsonFormsI18nState. */
export const jsonFormsZhI18n={
  locale:'zh-CN',
  translate:translateJsonFormsText,
  translateError:error=>localizeValidationMessage(error.message??''),
} as I18nState;
