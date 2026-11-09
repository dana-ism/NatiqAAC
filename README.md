# NatiqAAC

NatiqAAC is a mobile application designed to support communication and language learning for children with autism.

## Project Goals

- Support communication through pictures and interactive activities.
- Help children learn words and gradually use them in sentences.
- Explore AI-powered features to support personalized learning.

## Planned Technologies

- **Mobile App:** Flutter
- **Backend:** NestJS
- **Database:** PostgreSQL
- **AI Service:** Python and FastAPI (planned; details to be determined)

## Project Structure

- `frontend/` — Mobile application.
- `backend/` — Backend APIs and application logic.
- `web/` — React authentication and Admin Portal V1; see [Admin documentation](docs/admin.md).
- `docs/` — Project documentation.

Authentication/account V2 adds verified parent and specialist registration,
provider identity linking and reviewed specialist applications. Read the
[implementation and migration guide](docs/auth-account-management-v2.md) and
[external provider setup](docs/auth-account-v2-providers.md). Live email, OAuth,
private document storage and Supabase migration require the documented owner
configuration and review; isolated tests do not establish production readiness.

## Project Status

The project is in the planning and setup stage. The final AI features and technical details will be determined after consulting speech-language specialists.

## Team

Developed as a university graduation project by two Computer Engineering students.
