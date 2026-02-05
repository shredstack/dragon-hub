# DragonHub Multi-School Authentication & Authorization Redesign

## Technical Specification

**Version:** 1.0
**Date:** February 2026
**Status:** Approved

---

## Executive Summary

Transform DragonHub from a single-school application to a multi-tenant platform with:
- **Super Admin** role for managing schools globally
- **School-based data isolation** to prevent data leakage
- **Code-based membership** with auto-approval
- **Annual lifecycle management** for school year transitions

---

## Current State

### Authentication
- NextAuth.js with magic links via Resend
- JWT session strategy
- Key files: `src/lib/auth.ts`, `src/lib/auth-helpers.ts`

### Database
- PostgreSQL with Drizzle ORM (24 tables)
- **No multi-tenancy**: No `schools` table, no `school_id` columns
- Current roles: `teacher`, `room_parent`, `pta_board`, `volunteer` (classroom-scoped only)

### Tables Requiring `school_id`
- `classrooms`
- `budgetCategories`
- `budgetTransactions`
- `fundraisers`
- `fundraiserStats`
- `calendarEvents`
- `knowledgeArticles`
- `eventPlans`
- `volunteerHours`

---

## New Role Hierarchy

| Role | Scope | Capabilities |
|------|-------|--------------|
| **Super Admin** | Global | Create schools, assign school admins, manage all schools |
| **School Admin** | School | Manage school settings, manage members, assign PTA board |
| **PTA Board** | School | Manage classrooms, approve volunteer hours, budget, events |
| **PTA Member** | School | View school data, submit hours, join events |
| **Teacher/Room Parent/Volunteer** | Classroom | Existing classroom-level roles (unchanged) |

---

## Database Schema

### New Enums

```typescript
// School membership status
export const schoolMembershipStatusEnum = pgEnum("school_membership_status", [
  "approved",   // Active membership
  "expired",    // Past school year, needs renewal
  "revoked",    // Admin removed access
]);

// School-level roles (separate from classroom roles)
export const schoolRoleEnum = pgEnum("school_role", [
  "admin",      // School Admin
  "pta_board",  // PTA Board
  "member",     // Regular PTA member
]);
```

### New Tables

#### `schools`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | School name (e.g., "Draper Elementary") |
| join_code | text | Unique code for joining (e.g., "DRAPER2026") |
| mascot | text | Optional mascot |
| address | text | Optional address |
| settings | text | JSON for school-specific config |
| active | boolean | Whether school is active |
| created_at | timestamp | Creation time |
| created_by | uuid | FK to users |

#### `school_memberships`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| school_id | uuid | FK to schools |
| user_id | uuid | FK to users |
| role | school_role | admin, pta_board, or member |
| school_year | text | e.g., "2025-2026" |
| status | school_membership_status | approved, expired, or revoked |
| invited_by | uuid | Optional FK to users |
| approved_by | uuid | Optional FK to users |
| approved_at | timestamp | When membership was approved |
| renewed_from | uuid | FK to previous membership (for renewals) |
| created_at | timestamp | Creation time |

**Unique constraint:** `(school_id, user_id, school_year)`

#### `super_admins`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users (unique) |
| granted_by | uuid | Optional FK to users |
| granted_at | timestamp | When super admin was granted |
| notes | text | Optional notes |

---

## User Flows

### School Join Flow

```
1. User signs up via magic link
   └─> Creates user record, email verified

2. User lands on dashboard
   └─> System detects no school membership
   └─> Redirects to "Join a School" page

3. User enters school join code
   └─> System validates code
   └─> Creates APPROVED membership immediately
   └─> User redirected to school dashboard
```

### Join Code Strategy

- **Format:** `{SCHOOL_ABBREV}{YEAR}` (e.g., "DRAPER2026")
- **Auto-approve:** Valid code = immediate access
- **Distribution:** Shared in PTA meetings, school newsletters
- **Rotation:** Regenerated annually with school year transition
- **Revocation:** School admins can revoke memberships if needed

### Annual School Year Transition

```
June:     School year winds down
July:     Admin generates new join code
August:   Previous year memberships → "expired"
          Users prompted to renew
Sept-May: Normal operations
```

### Membership Renewal Options

1. **Self-renewal:** Returning members click "Renew" for next year
2. **Bulk renewal:** Admin selects members to auto-renew
3. **New members:** Standard join code flow

---

## Implementation Phases

### Phase 1: Database Foundation
- Add new enums to schema
- Create `schools`, `school_memberships`, `super_admins` tables
- Add `school_id` column (nullable first) to existing tables
- Update TypeScript types
- Create Drizzle migrations

### Phase 2: Auth Layer Updates
- Add super admin helpers: `isSuperAdmin()`, `assertSuperAdmin()`
- Add school membership helpers: `assertSchoolMember()`, `assertSchoolRole()`
- Add school context: `getCurrentSchoolId()` from session
- Update JWT callbacks to include school context

### Phase 3: Super Admin Portal
- Create `/super-admin/` route group
- School list, create, edit pages
- Assign school admin functionality
- Join code management

### Phase 4: School Join Flow
- Create `/join-school` page
- School code entry form
- Update app layout to check membership
- Redirect logic for users without schools

### Phase 5: Data Scoping
- Update all server actions with `schoolId`
- Update all database queries to filter by school
- Update all pages to use school context
- Test data isolation between schools

### Phase 6: Annual Lifecycle
- Year transition management UI
- Bulk membership renewal
- Self-service renewal page
- Expired membership handling

---

## Migration Strategy

### Step 1: Schema Changes (Non-Breaking)
```sql
-- Create new enums
CREATE TYPE school_membership_status AS ENUM ('approved', 'expired', 'revoked');
CREATE TYPE school_role AS ENUM ('admin', 'pta_board', 'member');

-- Create new tables
CREATE TABLE schools (...);
CREATE TABLE school_memberships (...);
CREATE TABLE super_admins (...);

-- Add nullable school_id to existing tables
ALTER TABLE classrooms ADD COLUMN school_id UUID REFERENCES schools(id);
-- (repeat for all 9 tables)
```

### Step 2: Data Migration
```sql
-- Create legacy school for existing data
INSERT INTO schools (name, join_code, mascot)
VALUES ('Draper Elementary', 'DRAPER2026', 'Dragons');

-- Assign all existing data to this school
UPDATE classrooms SET school_id = '<school-uuid>';
-- (repeat for all tables)

-- Create memberships for existing users
INSERT INTO school_memberships (school_id, user_id, role, school_year, status)
SELECT '<school-uuid>', user_id,
       CASE WHEN role = 'pta_board' THEN 'pta_board' ELSE 'member' END,
       '2025-2026', 'approved'
FROM classroom_members;

-- Designate super admin
INSERT INTO super_admins (user_id, notes)
SELECT id, 'Initial super admin'
FROM users WHERE email = 'shredstacksarah@gmail.com';
```

### Step 3: Enforce Constraints
```sql
-- Make school_id required
ALTER TABLE classrooms ALTER COLUMN school_id SET NOT NULL;
-- (repeat for all tables)

-- Add indexes
CREATE INDEX idx_classrooms_school_id ON classrooms(school_id);
-- (repeat for key tables)
```

---

## New Server Actions

### Super Admin (`src/actions/super-admin.ts`)
| Action | Description |
|--------|-------------|
| `createSchool(data)` | Create a new school |
| `updateSchool(id, data)` | Update school details |
| `assignSchoolAdmin(schoolId, userId)` | Make user a school admin |
| `listAllSchools()` | Get all schools |
| `regenerateJoinCode(schoolId)` | Generate new join code |

### School Membership (`src/actions/school-membership.ts`)
| Action | Description |
|--------|-------------|
| `joinSchool(joinCode)` | Join school with code (auto-approve) |
| `leaveSchool(schoolId)` | User leaves voluntarily |
| `removeMember(membershipId)` | Admin removes a member |
| `updateMemberRole(membershipId, role)` | Change member's school role |
| `renewMyMembership(schoolId)` | Self-service renewal |

### School Year (`src/actions/school-year.ts`)
| Action | Description |
|--------|-------------|
| `transitionSchoolYear(schoolId, newYear)` | Start new school year |
| `bulkRenewMemberships(schoolId, ids, year)` | Renew selected members |
| `expirePreviousYearMemberships(schoolId)` | Expire old memberships |

---

## Auth Helper Functions

### New Functions for `src/lib/auth-helpers.ts`

```typescript
// Super admin checks
isSuperAdmin(userId: string): Promise<boolean>
assertSuperAdmin(userId: string): Promise<void>

// School membership checks
getSchoolMembership(userId: string, schoolId: string): Promise<SchoolMembership | null>
assertSchoolMember(userId: string, schoolId: string): Promise<SchoolMembership>
assertSchoolRole(userId: string, schoolId: string, roles: SchoolRole[]): Promise<SchoolMembership>
isSchoolAdmin(userId: string, schoolId: string): Promise<boolean>

// School context
getCurrentSchoolId(): Promise<string | null>
setCurrentSchoolId(schoolId: string): void
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Super admin storage | Separate table | Clean audit trail, easy revocation |
| Join code behavior | Auto-approve | Simpler onboarding, code is the gatekeeper |
| Multi-school support | Schema supports it | One school per user initially, easy to expand |
| Membership scope | Per school year | Enables annual cleanup/renewal |
| Classroom roles | Keep separate | Different scope than school roles |
| Email notifications | Skip for now | Can add later |

---

## Testing Checklist

- [ ] Schema migration runs successfully
- [ ] Super admin can access super admin portal
- [ ] Super admin can create new school
- [ ] Join code is generated correctly
- [ ] New user can join with valid code
- [ ] Invalid code shows error
- [ ] Data isolation works between schools
- [ ] School admin can manage members
- [ ] PTA board permissions work correctly
- [ ] Member permissions are limited appropriately
- [ ] Year transition expires old memberships
- [ ] Renewal flow works for returning members

---

## File Changes Summary

### New Files
- `src/app/(super-admin)/layout.tsx`
- `src/app/(super-admin)/dashboard/page.tsx`
- `src/app/(super-admin)/schools/page.tsx`
- `src/app/(super-admin)/schools/new/page.tsx`
- `src/app/(super-admin)/schools/[id]/page.tsx`
- `src/app/(app)/join-school/page.tsx`
- `src/app/(app)/admin/school-year/page.tsx`
- `src/app/(app)/renew-membership/page.tsx`
- `src/actions/super-admin.ts`
- `src/actions/school-membership.ts`
- `src/actions/school-year.ts`
- `src/components/school/join-school-form.tsx`

### Modified Files
- `src/lib/db/schema.ts` - New tables, enums, school_id columns
- `src/lib/auth-helpers.ts` - New helper functions
- `src/lib/auth.ts` - School context in JWT
- `src/types/index.ts` - New types
- `src/lib/constants.ts` - Role constants
- `src/app/(app)/layout.tsx` - Membership check
- `src/app/(app)/dashboard/page.tsx` - No-school state
- `src/components/layout/sidebar.tsx` - School name display
- `src/actions/admin.ts` - Add schoolId
- `src/actions/classrooms.ts` - Add schoolId
- `src/actions/budget.ts` - Add schoolId
- `src/actions/volunteer-hours.ts` - Add schoolId
- `src/actions/fundraisers.ts` - Add schoolId
- `src/actions/knowledge.ts` - Add schoolId
- `src/actions/event-plans.ts` - Add schoolId
