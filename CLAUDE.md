# Telemedi Voice Intake — Product Engineer Assessment

## Purpose

Build a small working prototype that reduces the friction of filling out
pre-consultation forms in telemedicine.

Instead of completing a traditional form, the patient should be able to
describe what is happening naturally by voice. AI should extract the required
information and help the patient see what information is still missing.

The prototype is intentionally limited to one end-to-end flow.

## Product context

The user is booking a teleconsultation either:
- for themselves
- for their child

The voice intake should collect five basic pieces of information:
1. What is wrong / symptoms
2. How long it has been happening
3. Temperature, if any
4. Medication already taken, if any
5. Age

The wording should adapt depending on whether the consultation is for the
user or their child.

## Product hypothesis

Voice can make pre-consultation intake faster and less frustrating than
manually filling out a form.

The main interaction to explore is a visible completeness checklist:
while the patient describes the problem naturally, the interface should help
them understand which required information has already been captured and
what is still missing.

Real-time completeness feedback is desirable, but it must not compromise
delivery of a reliable end-to-end flow within the assessment time limit.

## Constraints

- Total implementation time: approximately 2 hours.
- Prioritize one working end-to-end flow over additional features.
- Keep the implementation as simple as possible.
- No backend unless absolutely necessary for the core flow.
- No authentication.
- No database or persistent patient data.
- No appointment scheduling.
- No diagnosis or medical advice.
- Do not over-engineer.
- Prefer the simplest solution that demonstrates the product idea.
- If a feature threatens completion of the core flow, simplify or cut it.

## Stack

- React Native
- Expo SDK 54
- TypeScript
- External AI service: to be decided during implementation

## Working approach

- Before making significant implementation decisions, consider their impact
  on the 2-hour constraint.
- Establish a complete working flow before adding enhancements.
- Treat real-time completeness feedback as an enhancement after the basic
  voice → AI analysis → result flow works.
- When there are multiple viable approaches, prefer the simplest reliable one.
- Point out when my requested approach risks unnecessary complexity or scope.
- Do not add abstractions, dependencies, or architecture without a clear need.