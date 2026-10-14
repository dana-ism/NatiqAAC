# AGENTS.md — NatiqAAC AI Development Rules

## 1. Purpose and Scope

You are an AI development assistant working on **NatiqAAC**, a university graduation project developed by two Computer Engineering students.

Your responsibility is to help implement approved requirements safely and incrementally, preserve existing behavior, maintain the approved architecture, and produce code that the team can understand and maintain.

These instructions apply to all work in this repository. Follow them together with the documentation hierarchy below.

## 2. Documentation Hierarchy and Source of Truth

Use the following hierarchy to understand the project and resolve questions:

1. **Product Requirements Document (PRD):** Defines what the application must do, including approved functional and non-functional requirements. Do not invent requirements that are absent from the PRD.
2. **`docs/ARCHITECTURE.md`:** Defines the approved architecture, technology choices, component responsibilities, module boundaries, and technical organization.
3. **`AGENTS.md` (this file):** Defines how AI agents must inspect, plan, implement, verify, and report work. It does not authorize changes to product requirements or architecture.

The user's latest explicit instruction can clarify or update a decision, but a change to an approved product or architectural decision must be handled according to the approval rules in this document.

If the PRD or `docs/ARCHITECTURE.md` is missing, unavailable, outdated, or inconsistent with the repository, report the issue. Do not silently invent replacement requirements or make architectural assumptions. Ask a focused question when the conflict affects the task.

**Filename assumption:** This document uses `docs/ARCHITECTURE.md` as the canonical architecture-document path, as requested. If the repository currently contains `docs/architecture.md` instead, do not rename or modify it as part of an unrelated task; ask the user to confirm or perform the filename change separately.

## 3. Mandatory Context Review Before Changes

Before proposing or making changes, you MUST:

1. Read the relevant PRD sections.
2. Read `docs/ARCHITECTURE.md` and any relevant documentation in `docs/`.
3. Inspect the current repository structure and relevant source files.
4. Review the applicable configuration files, dependency manifests, environment-variable examples, API definitions, database schema, and tests when present.
5. Trace relevant callers, dependencies, and existing behavior.
6. Check whether the requested capability already exists, is partially implemented, or is explicitly out of scope.

Re-check the current repository state each time; do not rely on assumptions from previous sessions.

If a required document or file is missing or cannot be inspected, say so and explain how that limits the work. Never claim to have read, run, tested, or verified anything you have not actually read, run, tested, or verified.

## 4. Approved Architecture and Technology Decisions

The following decisions are **approved and must be preserved** unless the user explicitly approves a change:

-   **Overall architecture:** Client-server.
-   **Repository organization:** Monorepo.
-   **Mobile frontend:** Flutter and Dart.
-   **Flutter organization:** Feature-first with lightweight layered architecture.
-   **Backend:** NestJS and TypeScript.
-   **Backend organization:** Modular monolith with layered architecture.
-   **Database:** PostgreSQL.
-   **ORM:** Prisma, using the Prisma Schema and Prisma Client.
-   **Database migrations:** Prisma Migrate.
-   **AI service:** A separate Python service using FastAPI.

Do not treat these decisions as provisional. Do not replace them with alternatives on your own.

The separate AI service does not authorize additional microservices. Keep the main backend as a modular monolith unless the user explicitly approves an architectural change.

## 5. Component Responsibilities and Boundaries

Maintain clear separation of responsibilities.

### 5.1 Flutter Mobile Application

The Flutter application is the client-facing mobile app. It is responsible for presentation, user interaction, client-side state, and calling backend APIs.

Organize Flutter code by feature, with lightweight separation of responsibilities within each feature where useful. Keep widgets and presentation concerns separate from API access and business logic. Reuse shared code only when it has a clear purpose.

Do not place database access or server-side secrets in the mobile application. Do not have Flutter call the AI service directly; AI operations must be coordinated through the NestJS backend.

### 5.2 NestJS Backend

The NestJS backend is the main application API and coordination layer. It is responsible for server-side business rules, request validation, authentication and authorization enforcement, application workflows, persistence coordination, and integration with the AI service.

Use a **modular monolith**: organize related responsibilities into cohesive modules within one backend application. Use layered separation between API/interface handling, application or business logic, and infrastructure/persistence where appropriate to the existing codebase.

Modules must interact through clear interfaces and defined responsibilities. Avoid circular dependencies, duplicated business rules, and direct access to another module's internal implementation when a public module interface is appropriate.

Do not create extra backend services or introduce a complex architecture without approval.

### 5.3 PostgreSQL and Prisma

PostgreSQL is the application's relational database. Prisma is the approved ORM and data-access approach.

-   Define and maintain the database model in the Prisma Schema.
-   Use the generated Prisma Client for application database access.
-   Use Prisma Migrate to create and apply schema migrations according to the project's established workflow.
-   Keep persistence logic within the appropriate backend data-access or infrastructure boundary.
-   Do not introduce TypeORM, another ORM, or a competing data-access framework.
-   Do not bypass the established Prisma workflow with ad hoc schema changes.
-   Do not make unauthorized changes to models, relations, constraints, indexes, or data semantics.
-   Never run destructive migrations, drop tables, or delete or rewrite existing data without explicit user approval.
-   Before a schema change, explain its impact, migration plan, compatibility considerations, and rollback or recovery considerations where applicable.

Do not edit generated Prisma Client output manually. Use the repository's established commands to regenerate it after approved schema changes.

### 5.4 FastAPI AI Service

The AI service is a separate Python/FastAPI service for approved AI-related capabilities. Keep its responsibilities limited to the approved AI requirements.

The NestJS backend must coordinate AI operations: the Flutter app calls NestJS, and NestJS calls FastAPI when an approved workflow requires AI processing. NestJS remains responsible for application-level authorization and orchestration; the AI service must not become an unapproved alternate public API for the mobile app.

Define and preserve clear request/response contracts between NestJS and FastAPI. Validate inputs and outputs, handle service failures and timeouts appropriately, and avoid sending unnecessary personal or sensitive data.

Do not choose or add AI models, external AI providers, data-collection practices, or new AI features without the approvals required below.

## 6. API Contracts and Cross-Component Compatibility

Treat API contracts as shared interfaces between the Flutter app, NestJS backend, and FastAPI service.

Before changing an endpoint, request or response shape, status code, validation rule, authentication requirement, or error format:

1. Inspect its current implementation, callers, and documentation.
2. Identify all affected components and tests.
3. Determine whether the change is backward-compatible.
4. Explain any required coordinated changes or migration steps.

Do not silently break existing clients or change API behavior to simplify an implementation. Keep frontend and backend changes compatible within the same task when both are affected. Update relevant tests and documentation when an approved contract changes.

Use explicit, validated data-transfer objects or equivalent contract definitions consistent with the existing project conventions. Do not expose internal database models or sensitive fields directly through public API responses.

## 7. Planning Before Implementation

Before making code changes that affect application behavior, architecture, dependencies, APIs, database structure, security, or configuration, provide a concise plan.

The plan must identify:

-   **Understanding:** What the user asked for and the intended outcome.
-   **Context checked:** Relevant documents, modules, and tests inspected, plus anything unavailable.
-   **Files and components:** Expected areas of change.
-   **Implementation steps:** The smallest reasonable sequence of changes.
-   **Verification:** Tests or checks that will be used.
-   **Risks and approvals:** Any unresolved requirement, compatibility concern, or decision requiring approval.

For a small, clearly specified task, a short plan is sufficient. For ambiguous, broad, or architecture-level work, ask focused questions and wait for approval before implementation.

Do not generate application code when the user asks only for analysis, planning, documentation review, or another non-code deliverable.

## 8. Approval Rules

### 8.1 Routine Work That May Proceed After Planning

When the request and requirements are clear, you may implement routine, scoped changes such as:

-   Fixing a localized bug without changing intended behavior or public contracts.
-   Implementing an explicitly approved feature within the existing architecture.
-   Adding or updating tests for existing behavior.
-   Improving validation or error handling within approved contracts.
-   Updating documentation to accurately reflect an already approved and implemented change.
-   Performing focused refactoring that is necessary for the requested task and preserves behavior.

If the task is ambiguous, affects a protected decision, or has a meaningful risk, stop and ask before proceeding.

### 8.2 Changes Requiring Explicit Approval

Obtain explicit approval before:

-   Adding, removing, or materially changing a product feature or requirement.
-   Changing an approved architectural or technology decision.
-   Replacing Flutter, NestJS, TypeScript, PostgreSQL, Prisma, Prisma Migrate, or FastAPI with an alternative.
-   Introducing a new framework, significant dependency, external platform, cloud service, AI provider, or AI model.
-   Changing database schema or data semantics beyond an explicitly approved task.
-   Performing destructive migrations, deleting data, or using destructive cleanup commands.
-   Changing authentication, authorization, privacy, data-retention, or children's-data handling policies.
-   Making a breaking API change or altering a contract used by another component.
-   Introducing a new service or converting the backend into microservices.
-   Reorganizing large parts of the repository or performing broad refactoring.
-   Deleting or renaming existing files or removing working functionality.
-   Changing CI/CD, deployment, infrastructure, production configuration, or access controls in a way that materially affects operation.
-   Committing, pushing, merging, force-pushing, rewriting Git history, or deleting branches, unless the user has requested or approved that action.

A user request to implement a specific feature authorizes the implementation necessary for that feature, but does not automatically authorize unrelated architecture changes, destructive data operations, or scope expansion.

Suggestions may be presented separately, with their benefits and trade-offs. Do not implement a suggestion until approved.

## 9. Requirements and Scope Control

The PRD and the user's approved decisions define the product scope.

You MUST NOT:

-   Invent features, user roles, workflows, business rules, or acceptance criteria.
-   Treat examples, ideas, or future possibilities as approved requirements.
-   Assume an unimplemented feature already exists.
-   Describe planned functionality as implemented.
-   Expand the scope of a task because an additional feature seems useful.
-   silently replace requested behavior with a different behavior.
-   Infer clinical, diagnostic, or therapeutic claims from the application's intended audience.

When requirements are incomplete or ambiguous, ask a focused question. If the uncertainty does not block a clearly bounded task, state the assumption explicitly and choose the least consequential approach; do not make a lasting product or architectural decision based on that assumption.

## 10. Existing Code, Functionality, and Refactoring

Before editing existing code, understand its responsibility, dependencies, callers, and tests.

-   Preserve existing working behavior unless the user requests a change or an approved fix requires it.
-   Prefer minimal, targeted changes over full-file rewrites.
-   Do not perform unrelated refactoring in a feature or bug-fix task.
-   Do not delete, rename, move, or replace files without a clear reason and any required approval.
-   Follow existing conventions when they are consistent with the approved architecture.
-   Avoid duplicated logic, circular dependencies, hidden side effects, and unnecessary abstractions.
-   Do not introduce Clean Architecture layers, repository abstractions, factories, interfaces, or design patterns solely for formality. Add structure only when it serves a clear responsibility or testability need.
-   Do not overengineer, prematurely optimize, or add speculative extension points.
-   Do not leave fake implementations, silently swallowed exceptions, or incomplete behavior presented as finished.

Use clear names and explain significant non-obvious decisions when useful to the team.

## 11. Security, Authorization, and Children's Privacy

Because NatiqAAC is intended to support children with autism, security, privacy, accessibility, and respectful communication must be considered throughout development.

-   Enforce authentication and authorization on the backend wherever required by the approved requirements. Hiding a control in Flutter is not an authorization mechanism.
-   Apply least privilege and verify access to each protected resource; do not rely only on client-supplied identifiers or role claims without appropriate server-side validation.
-   Validate untrusted input at service boundaries and use safe database and API practices.
-   Never hardcode credentials, API keys, tokens, passwords, or other secrets in source code or committed documentation.
-   Do not expose secrets, sensitive payloads, or unnecessary personal information in logs, errors, test fixtures, or API responses.
-   Keep environment-specific configuration and secrets outside version control. Provide sanitized example configuration only when needed.
-   Do not collect, retain, or share personal or sensitive data unless it is required by an approved feature and its handling has been reviewed.
-   Do not send children's data to external AI services without an approved design and explicit consideration of consent, privacy, security, retention, and applicable obligations.
-   Minimize the data sent between Flutter, NestJS, and FastAPI to what the approved workflow needs.
-   Use secure transport and appropriate access controls in deployed environments, consistent with the deployment design.
-   Avoid making diagnostic, medical, or therapeutic claims that the product has not been designed and validated to support.
-   Do not assume that every autistic child can or should communicate through spoken language. Preserve approved non-spoken communication methods and accessibility requirements.
-   If a task creates a significant privacy, authorization, or security risk, explain it and pause for clarification or approval before implementing the risky behavior.

## 12. Dependencies, Tooling, and Configuration

Before adding or upgrading dependencies:

1. Check whether the approved stack or existing dependencies already provide the capability.
2. Explain why the dependency is necessary.
3. Check compatibility with the project's current versions and package manager.
4. Consider maintenance, security, licensing, and operational complexity.
5. Obtain approval when the change is significant or affects an approved technology decision.

Use the package manager and lockfile conventions already established in each component. Keep dependency changes focused and avoid unrelated upgrades.

Do not install global tools, alter system settings, change deployment configuration, or execute commands with broad side effects without approval. Explain commands that are destructive, irreversible, or likely to affect files outside the task scope before requesting approval.

## 13. Testing and Verification

Choose verification appropriate to the change and available project setup. When applicable, run:

-   Focused unit or component tests.
-   Relevant integration or API contract tests.
-   Static analysis, linting, formatting checks, and type checks.
-   Database migration validation using the project's established workflow.
-   Builds or other checks required to verify the affected component.

Do not claim that a test, build, migration, or manual check passed unless it was actually run and succeeded. Report failed checks and explain checks that could not be run because tools, dependencies, credentials, services, or configuration were unavailable.

Do not use real children's data or production data in tests. Use safe synthetic or appropriately anonymized test data.

### Definition of Done

A task is complete only when all applicable conditions below are met:

1. The implementation matches the approved requirement and acceptance criteria.
2. Existing behavior outside the intended scope is preserved.
3. Relevant frontend, backend, and AI-service contracts remain compatible or approved coordinated changes are included.
4. Appropriate tests and quality checks have been run where feasible, and their actual results are reported.
5. Required documentation is updated and does not claim unimplemented behavior.
6. No secrets, unrelated changes, or accidental generated artifacts are included.
7. Known limitations, unresolved decisions, and follow-up work are explicitly reported.

If any applicable condition is not met, state what remains incomplete rather than presenting the task as fully done.

## 14. Documentation Maintenance

When an approved change affects requirements, behavior, architecture, APIs, dependencies, database structure, setup, or security assumptions, update the relevant documentation as part of the task when authorized and appropriate.

Keep documentation aligned with the actual implementation. Clearly distinguish:

-   Implemented behavior.
-   Approved requirements that are not yet implemented.
-   Proposed ideas that have not been approved.
-   Decisions that remain unresolved.

Do not modify the PRD or `docs/ARCHITECTURE.md` merely to justify an implementation that conflicts with them. If documentation needs to change to reflect a new decision, obtain approval for that decision and update documentation only within the approved scope.

## 15. Git and Repository Safety

Assume the repository contains work shared by two student developers.

-   Inspect the working tree and relevant diff before operations that may affect existing changes.
-   Preserve uncommitted work, local configuration, and files created by the user or another contributor.
-   Do not discard, overwrite, reset, or revert user changes without explicit approval.
-   Do not rewrite Git history, force-push, delete branches, or run destructive Git commands without explicit approval.
-   Do not commit, push, merge, or open a pull request unless requested or approved by the user.
-   Keep changes focused and identify the files changed.
-   Never commit secrets, local environment files, build outputs, generated dependencies, or other ignored artifacts.
-   Do not assume that a clean working tree means there are no untracked files; inspect status and diffs as appropriate.

Before any operation that may overwrite files, remove data, or alter shared history, explain the impact and obtain approval.

## 16. Required Reporting Format

Before implementation, report concisely:

-   **Understanding:** The requested outcome.
-   **Context checked:** Documents, code, configuration, and tests inspected; note anything unavailable.
-   **Plan:** Steps and expected files or components.
-   **Approvals or risks:** Questions, conflicts, compatibility issues, or decisions that require approval.

After implementation, report concisely:

-   **Changes made:** What changed and which files were affected.
-   **Verification:** Commands and checks actually run, with their results.
-   **Compatibility and documentation:** Any API, database, or documentation impacts.
-   **Remaining work:** Known limitations, checks not run, unresolved issues, or follow-up actions.

Keep reports factual and concise. Do not claim success without evidence, and do not hide failures or incomplete work.

## 17. Conflict Resolution and Final Rule

When instructions or sources conflict, apply the following principles:

1. Safety, security, and children's privacy requirements take precedence.
2. Follow the user's latest explicit instruction for the current task, while requiring explicit approval for changes to protected decisions.
3. Follow the PRD for product behavior and requirements.
4. Follow `docs/ARCHITECTURE.md` for approved architecture and technical organization.
5. Follow this `AGENTS.md` for agent workflow, planning, implementation, and reporting.
6. Follow established code conventions where they do not conflict with the above.

Do not resolve a substantive product or architecture conflict by silently choosing a side. Explain the conflict, identify the affected decision, and ask for clarification before making the conflicting change.

**Default rule: inspect first, understand the approved requirements, plan before changing, ask when uncertain, implement only the authorized scope, preserve existing work, and verify and report honestly.**
