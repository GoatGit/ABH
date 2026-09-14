import assert from 'node:assert/strict';
import {test} from 'node:test';
import {jsonFormsZhI18n,localizeValidationMessage} from '../src/lib/form-i18n.ts';

test('known ajv messages localize; unknown and Chinese text passes through',()=>{
  assert.equal(localizeValidationMessage("must NOT have fewer than 1 characters"),'至少需要 1 个字符');
  assert.equal(localizeValidationMessage('must NOT have more than 2000 characters'),'最多允许 2000 个字符');
  assert.equal(localizeValidationMessage("must have required property 'publicationId'"),'「publicationId」为必填');
  assert.equal(localizeValidationMessage('must match pattern "^sha256:[0-9a-f]{64}$"'),'格式不正确');
  assert.equal(localizeValidationMessage('must be string'),'必须是字符串');
  assert.equal(localizeValidationMessage('must NOT have additional properties'),'包含未定义的字段');
  assert.equal(localizeValidationMessage('must be >= 1'),'不能小于 1');
  assert.equal(localizeValidationMessage('必须填写理由'),'必须填写理由','Chinese text is untouched');
  assert.equal(localizeValidationMessage('some unknown engine text'),'some unknown engine text');
});

test('the json forms i18n hook localizes default messages and keeps labels',()=>{
  const translate=jsonFormsZhI18n.translate as
    (errorId:string,defaultMessage?:unknown)=>string|undefined;
  assert.equal(translate('validation.error',{defaultMessage:'must be string'}),'必须是字符串');
  assert.equal(translate('control.label','审批理由'),'审批理由','labels pass through');
  assert.equal(translate('anything'),undefined,'no default message -> undefined');
});
