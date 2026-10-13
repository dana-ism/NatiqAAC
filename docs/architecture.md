# NatiqAAC – Project Architecture

## 1. Project Overview

NatiqAAC is a mobile application designed to support communication and language learning for children with autism.

The application will use interactive learning activities, pictures, sounds, and AI-powered features to support each child's learning needs.

## 2. System Architecture

The system will use a client-server architecture.

- **Frontend:** Flutter mobile application.
- **Backend:** NestJS server responsible for application logic and APIs.
- **Database:** PostgreSQL for storing application data.
- **AI Service:** FastAPI service for AI features, once the required models and features are selected.

## 3. Communication Between Components

1. The user interacts with the Flutter application.
2. The application sends API requests to the NestJS backend.
3. The backend reads or writes data in PostgreSQL.
4. When an AI feature is needed, the backend communicates with the FastAPI service.
5. The result is returned to the application through the backend.

## 4. Security and Privacy

- Authentication and authorization will be implemented where needed.
- Children’s data and personal information must be protected.
- Access to sensitive information will be restricted.
- AI-related data collection and storage will be decided carefully.

## 5. Future Development

The project will start with the mobile application. A web application may be added later, depending on the available time and project requirements.

The exact AI features, models, and data-retention policies will be decided after consulting speech-language specialists and reviewing the project requirements.