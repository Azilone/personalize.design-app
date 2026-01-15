---
description: Explore codebase, create implementation plan, code, and test following EPCT workflow
---

# Explore, Plan, Code, Test Workflow

At the end of this message, I will ask you to do something.
Please follow the "Explore, Plan, Code, Test" workflow when you start.

## Explore

First, use parallel subagents to find and read all files that may be useful for implementing the ticket, either as examples or as edit targets. The subagents should return relevant file paths, and any other info that may be useful.

## Plan

Next, think hard and write up a detailed implementation plan. Don't forget to include tests, lookbook components, and documentation. Use your judgement as to what is necessary, given the standards of this repo.

If there are things you are not sure about, use parallel subagents to do some web research. They should only return useful information, no noise.

If there are things you still do not understand or questions you have for the user, pause here to ask them before continuing.

## Evaluate Confidence

After creating your implementation plan, you MUST evaluate your confidence level before proceeding to code.

### Confidence Assessment Process:

1. **Analyze your understanding** of:
   - The exact requirements and objectives
   - The technical approach and implementation details
   - Potential impacts on existing code
   - Edge cases and constraints
   - Expected behavior and outcomes

2. **Calculate your confidence percentage** (0-100%):
   - List all aspects you are certain about
   - List all aspects with uncertainty or ambiguity
   - Compute: `confidence = (certain_points / total_points) × 100`

3. **Decision threshold**:
   - **≥ 95% confidence**: Proceed to Code phase
   - **< 95% confidence**: STOP and ask clarifying questions

### If confidence < 95%:

You MUST pause and ask the user structured questions **IN FRENCH** to reach 95% confidence. Focus on:

- **Unclear objectives**: What exactly should the feature do? What are the expected inputs/outputs?
- **Ambiguous requirements**: Are there specific business rules, validation rules, or behaviors to implement?
- **Technical constraints**: Are there performance requirements, compatibility needs, or architectural patterns to follow?
- **Scope boundaries**: What should NOT be modified? What is explicitly out of scope?
- **Edge cases**: How should the system handle error conditions, empty states, or unusual inputs?
- **User experience**: Are there specific UI/UX requirements or user flows to implement?

**IMPORTANT**: Write your confidence report and questions **IN FRENCH**.

**Format your confidence report clearly**:
```
Niveau de confiance : [X]%

Certitudes :
- [Liste de ce dont vous êtes sûr]

Incertitudes :
- [Liste de ce qui nécessite des clarifications]

Questions pour l'utilisateur :
1. [Question spécifique]
2. [Question spécifique]
...
```

Only proceed to the Code phase once you have achieved ≥ 95% confidence.

## Code

When you have a thorough implementation plan, you are ready to start writing code. Follow the style of the existing codebase (e.g. we prefer clearly named variables and methods to extensive comments). Make sure to run our autoformatting script when you're done, and fix linter warnings that seem reasonable to you.

### Important

- You code ALWAYS stay on the SCOPE of the changes. Do not changes anything else. Keep stuck to your task and goal.
- Do not comments your code.

## Test

Use parallel subagents to run tests, and make sure they all pass.

If your changes touch the UX in a major way, use the browser to make sure that everything works correctly. Make a list of what to test for, and use a subagent for this step.

If your testing shows problems, go back to the planning stage and think ultrahard.

## Write up your work

When you are happy with your work, write up a short report that could be used as the PR description. Include what you set out to do, the choices you made with their brief justification, and any commands you ran in the process that may be useful for future developers to know about.