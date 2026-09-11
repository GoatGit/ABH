package abh_fixture

import rego.v1

default allow := false
allow if {
  input.active == true
  input.purpose == "abh.action.execute"
  input.amount <= input.ceiling
}

decision := {"allow": allow, "obligationRefs": [], "reasonCodes": []}
empty_behavior := {"allow": true, "obligationRefs": [], "reasonCodes": []}
malformed := {"allow": "true", "obligationRefs": [], "reasonCodes": []}
undefined_decision := decision if input.missing == "required"
host_time := {"allow": time.now_ns() > 0, "obligationRefs": [], "reasonCodes": []}
workload := count([x | x := numbers.range(0, input.work)[_]; y := numbers.range(0, input.work)[_]; x == y])
slow := {"allow": workload >= 0, "obligationRefs": [], "reasonCodes": []}

default action_allowed := false
action_allowed if {
  input.schemaVersion == "0.1.0"
  input.purposeOfUse == "abh.action.execute"
  input.executionAuthority.status == "Active"
  input.action.position.lifecycle in {"Validated", "Authorized", "Executing"}
  input.action.actionType == input.executionAuthority.actionTypes[_]
  input.action.actionType == input.grants[_].actionTypes[_]
}
action_decision := {"allow": action_allowed, "obligationRefs": [], "reasonCodes": []}

# Delegation fixture: inputs have no Action lifecycle and must match the source grant.
default scope_allowed := false
scope_allowed if {
  input.schemaVersion == "0.1.0"
  input.draft.executionPrincipalRef.id == input.grants[0].principalRef.id
  input.grants[0].status == "Active"
  input.draft.actionTypes == input.grants[0].actionTypes
  input.draft.scopeRefs == input.grants[0].scopeRefs
}
scope_decision := {"allow": scope_allowed, "obligationRefs": [], "reasonCodes": []}
