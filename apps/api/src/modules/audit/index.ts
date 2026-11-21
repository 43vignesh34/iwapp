// Public surface of the audit module. Every module that writes personal data uses these.
export { diffFields, recordAudit, type AuditEntry } from './service.ts';
