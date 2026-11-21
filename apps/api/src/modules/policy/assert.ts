import { AppError } from '../../errors.ts';
import { authorize, type Action, type PersonResource, type PolicyActor } from './policy.ts';

/** authorize(), but throws 403 FORBIDDEN instead of returning false. For use in services. */
export function assertAllowed(actor: PolicyActor, action: Action, resource?: PersonResource): void {
  if (!authorize(actor, action, resource)) {
    throw new AppError('forbidden', 'FORBIDDEN', 'You do not have permission to do this.');
  }
}
