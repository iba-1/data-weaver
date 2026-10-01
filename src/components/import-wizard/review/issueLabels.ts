import type { ResolvedMessages } from '@/lib/import-wizard/messages';
import type { IssueGroup } from '@/lib/import-wizard/issueGroups';

/** A group's short name: what kind of problem, in which field */
export function groupTitle(m: ResolvedMessages, group: IssueGroup, field: string): string {
  switch (group.cause) {
    case 'required':
      return m.review.groupRequired({ field });
    case 'notAnOption':
      return m.review.groupNotAnOption({ field });
    case 'invalidNumber':
      return m.review.groupInvalidNumber({ field });
    case 'invalidDate':
      return m.review.groupInvalidDate({ field });
    case 'ambiguousNumber':
      return m.review.groupAmbiguousNumber({ field });
    default:
      return m.review.groupOther({ field, message: group.message });
  }
}
