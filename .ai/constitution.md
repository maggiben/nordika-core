# Nodika Core Constitution

- Build only capabilities supported by explicit product requirements and repository evidence.
- Preserve public API compatibility unless a change is explicitly authorized.
- Keep NestJS controllers focused on HTTP translation and services focused on use cases.
- Treat all external input and configuration as untrusted; protect secrets and minimize stored data.
- Add focused tests for every behavior change and run relevant validation before handoff.
- Do not invent infrastructure, authentication, deployment, or integration conventions that this repository has not adopted.
