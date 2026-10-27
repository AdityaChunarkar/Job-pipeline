import type { ApplicationStatus } from '@prisma/client';

export const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEW', 'REJECTED'],
  INTERVIEW: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
};

export const canTransition = (from: ApplicationStatus, to: ApplicationStatus) =>
  TRANSITIONS[from].includes(to);

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SHORTLISTED: 'Shortlisted',
  INTERVIEW: 'Interview',
  HIRED: 'Hired',
  REJECTED: 'Rejected',
};
