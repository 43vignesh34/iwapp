// Public surface of the policy module: every permission decision goes through here.
export {
  authorize,
  capabilitiesFor,
  type Action,
  type PersonResource,
  type PolicyActor,
} from './policy.ts';
export { assertAllowed } from './assert.ts';
