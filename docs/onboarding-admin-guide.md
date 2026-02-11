# Board Member Onboarding Admin Guide

This guide explains how to set up and maintain the PTA Board Member Onboarding system in DragonHub. The onboarding hub helps new board members get up to speed quickly by providing role-specific resources, checklists, advice from predecessors, and AI-generated guides.

---

## Table of Contents

1. [Overview: What Is Board Onboarding?](#overview-what-is-board-onboarding)
2. [Who Can Configure What](#who-can-configure-what)
3. [Setting Up Onboarding Resources](#setting-up-onboarding-resources)
4. [Creating Role-Specific Checklists](#creating-role-specific-checklists)
5. [Managing the Event Catalog](#managing-the-event-catalog)
6. [How AI Guides Work](#how-ai-guides-work)
7. [Handoff Notes: Passing the Torch](#handoff-notes-passing-the-torch)
8. [Keeping Everything Up to Date](#keeping-everything-up-to-date)
9. [Tips for Success](#tips-for-success)

---

## Overview: What Is Board Onboarding?

When a new board member joins the PTA, they often feel overwhelmed. They might ask:
- "What am I supposed to do in this role?"
- "Where do I find important documents?"
- "What events am I responsible for?"
- "Who should I talk to?"

The Board Onboarding Hub answers all these questions in one place. It combines:

| Feature | What It Does |
|---------|--------------|
| **Resources** | Links to helpful documents, training, and handbooks |
| **Checklists** | Step-by-step tasks to complete during onboarding |
| **Event Catalog** | List of all PTA events with details and volunteer needs |
| **Handoff Notes** | Advice and tips from the previous person in the role |
| **AI Onboarding Guide** | A personalized guide generated just for their position |

---

## Who Can Configure What

Different people can manage different parts of the onboarding system:

| Role | What They Can Do |
|------|------------------|
| **Super Admin** | Manage state-wide and district-wide resources that apply to all schools |
| **School Admin / PTA President** | Manage school-specific resources, checklists, and event catalog |
| **Any Board Member** | Write handoff notes for their position, express event interest |

---

## Setting Up Onboarding Resources

Resources are links to helpful materials like handbooks, training videos, and reference documents.

### Where to Find It
**PTA Board Hub → Operations → Onboarding Config**

### Three Levels of Resources

DragonHub supports resources at three levels:

1. **State Resources** (Super Admin only)
   - Apply to all schools in the state
   - Example: Utah PTA Handbook, National PTA training links
   - Great for standard PTA resources everyone needs

2. **District Resources** (Super Admin only)
   - Apply to all schools in a specific district
   - Example: District volunteer policies, local PTA council contacts

3. **School Resources** (School Admin / President)
   - Specific to your school only
   - Example: Your school's Google Drive folder, local vendor contacts

### Adding a Resource

1. Go to **Onboarding Config**
2. Click **Add Resource**
3. Fill in the form:
   - **Title**: A clear, descriptive name (e.g., "Utah PTA Treasurer Handbook")
   - **URL**: The web link to the resource
   - **Description**: Brief explanation of what's in the resource
   - **Position**: Which board position this is for (leave blank for all positions)
   - **Category**: Choose from Training, Handbook, Template, Tool, or Other

### Best Practices for Resources

- **Be specific with titles** — "2024-25 Budget Template" is better than "Budget Stuff"
- **Check links annually** — Links break over time, verify they still work
- **Target by position** — Treasurers don't need membership resources cluttering their view
- **Include Utah PTA resources** — They have excellent handbooks for every position
- **Add your school's Drive links** — Point to folders with historical documents

### Suggested Resources by Position

| Position | Suggested Resources |
|----------|---------------------|
| **All Positions** | Utah PTA Handbook, National PTA E-Learning, Your school's PTA Google Drive |
| **President** | President's Handbook, Roberts Rules of Order quick guide |
| **Treasurer** | Utah PTA Treasurer Handbook, Budget templates, Audit checklist |
| **Secretary** | Minutes templates, Bylaws copy, Meeting agenda templates |
| **Membership VP** | Givebacks portal link, Membership drive materials |
| **Room Parent VP** | Room parent coordinator guide, Classroom party guidelines |

---

## Creating Role-Specific Checklists

Checklists give new board members concrete tasks to complete during their first weeks.

### Where to Find It
**PTA Board Hub → Operations → Onboarding Config → Checklists tab**

### Adding a Checklist Item

1. Go to the **Checklists** tab
2. Click **Add Checklist Item**
3. Fill in:
   - **Task Title**: What they need to do (e.g., "Review last year's budget")
   - **Description**: More detail on how to complete it (optional)
   - **Position**: Which role this applies to (leave blank for all)
   - **Order**: What order to display it (lower numbers appear first)

### Sample Checklist Items

**For All Board Members:**
- [ ] Read the PTA bylaws
- [ ] Review the board member expectations document
- [ ] Attend your first board meeting
- [ ] Complete Utah PTA training for your role
- [ ] Meet with the person previously in your position

**For Treasurer:**
- [ ] Get added to the bank account
- [ ] Review last year's budget and actual spending
- [ ] Set up reimbursement request process
- [ ] Understand the audit requirements
- [ ] Review the treasurer's handbook

**For Secretary:**
- [ ] Get access to the minutes archive
- [ ] Learn the minutes template format
- [ ] Understand quorum requirements
- [ ] Review the bylaws and standing rules

### Tips for Effective Checklists

- **Keep items actionable** — Start with verbs: "Review", "Meet with", "Set up"
- **Be specific** — "Review last year's Fall Carnival budget" beats "Learn about events"
- **Order logically** — Put foundational tasks (read bylaws) before specific tasks
- **Include meetings** — "Schedule a handoff call with your predecessor"
- **Don't overwhelm** — 10-15 items per role is plenty

---

## Managing the Event Catalog

The Event Catalog is a library of all the events your PTA runs throughout the year. New board members can browse it to understand what's involved in each event and volunteer to help.

### Where to Find It
**PTA Board Hub → Content & Communication → Event Catalog**

### Two Ways to Add Events

**1. Auto-Generate from Event Plans (Recommended)**

If you've been using DragonHub's event planning feature, you can automatically create catalog entries from completed events:

1. Go to **Event Catalog**
2. Click **Generate Entries** in the purple banner
3. DragonHub will create entries for any completed event that doesn't already have one

This pulls in:
- Event title and description
- Budget amount
- Volunteer count (from task assignments)
- Key tasks from the event plan

**2. Add Events Manually**

For events not yet in DragonHub's event planning system:

1. Click **Add Event Manually**
2. Fill in the form:
   - **Event Type**: Category like "fundraiser", "social", "meeting"
   - **Title**: Name of the event (e.g., "Fall Carnival")
   - **Description**: What the event is about
   - **Typical Timing**: When it usually happens (e.g., "October")
   - **Estimated Budget**: Rough cost (e.g., "$500-1000")
   - **Estimated Volunteers**: How many helpers needed (e.g., "15-20 volunteers")
   - **Key Tasks**: Main things that need to happen (one per line)
   - **Tips**: Advice for running this event well
   - **Related Positions**: Which board roles typically lead this

### How Board Members Use the Catalog

When new board members visit the onboarding hub, they can:

1. **Browse all events** to understand the PTA's annual calendar
2. **Express interest** in events they'd like to help with:
   - **Lead** — "I want to be the primary organizer"
   - **Help** — "I'd like to volunteer but not lead"
   - **Watch** — "I'm curious and want to learn"

This helps the board coordinate who's responsible for what.

### Tips for a Great Event Catalog

- **Include all recurring events** — Even small ones like teacher appreciation
- **Be honest about effort** — If an event is a lot of work, say so
- **Add tips from experience** — "Book the venue by August" or "Order 20% more pizza than you think"
- **Update after each event** — Refine estimates based on what actually happened
- **Note what went well and poorly** — Future organizers will thank you

---

## How AI Guides Work

The AI Onboarding Guide is a personalized document generated specifically for each board position. It synthesizes information from multiple sources into one comprehensive guide.

### What the AI Uses to Create the Guide

The AI pulls from these sources (when available):

| Source | What It Contributes |
|--------|---------------------|
| **Handoff Notes** | Tips, advice, and warnings from previous board members in this role |
| **Knowledge Base Articles** | Relevant articles tagged for this position or role-related topics |
| **Google Drive Documents** | Files indexed from your PTA's Drive that match the role |
| **Event Information** | Events associated with this position from the catalog |

### What's in a Generated Guide

A typical AI guide includes:

1. **Role Overview** — What this position does and why it matters
2. **Key Responsibilities** — The main duties and expectations
3. **First Week Checklist** — Priority tasks to tackle immediately
4. **Monthly Calendar** — What to focus on each month of the school year
5. **Important Contacts** — People this role works with frequently
6. **Tips from Predecessors** — Synthesized advice from handoff notes
7. **Helpful Resources** — Links to relevant documents and tools

### How to Get Better AI Guides

The AI can only work with what's available. To improve the guides:

1. **Encourage outgoing board members to write handoff notes** — This is the richest source of role-specific wisdom

2. **Build your Knowledge Base** — Add articles about:
   - How specific events work at your school
   - Vendor information and contacts
   - Historical context and traditions
   - Process documentation

3. **Connect Google Drive** — Index your PTA's Drive so the AI can reference past documents

4. **Tag content appropriately** — Use position names as tags on Knowledge Base articles

### Generating and Publishing Guides

1. Board members can generate their own guide from the onboarding hub
2. Admins can generate guides for any position from the admin panel
3. Generated guides can be **published to the Knowledge Base** as permanent articles
4. Guides can be **regenerated** anytime as new information becomes available

---

## Handoff Notes: Passing the Torch

Handoff notes are personal messages from outgoing board members to their successors. They're often the most valuable part of onboarding because they contain real-world experience.

### What Makes a Good Handoff Note

Encourage outgoing board members to include:

**Key Accomplishments**
- What did you achieve this year?
- What are you proud of?
- What new initiatives did you start?

**Ongoing Projects**
- What's in progress that needs to continue?
- What commitments were made for next year?
- What deadlines are coming up?

**Tips and Advice**
- What do you wish you'd known on day one?
- What mistakes did you make that they can avoid?
- What relationships are important to nurture?

**Important Contacts**
- Who are the key people to know?
- Any vendor contacts or community partners?
- Who's helpful at the district or state PTA level?

**Files and Resources**
- Where are the important documents?
- Any passwords or access that needs to be transferred?
- What tools or systems do you use?

### When to Request Handoff Notes

The best time to collect handoff notes is:
- **May-June**: Before school ends and memories are fresh
- **After elections**: When outgoing members know who's replacing them
- **Before summer break**: Don't wait until fall when people are scattered

### Tips for Admins

- Send a reminder email to outgoing board members in May
- Make the handoff note form easy to find in the onboarding hub
- Thank people for taking the time to write thorough notes
- Consider making handoff notes a board expectation

---

## Keeping Everything Up to Date

An outdated onboarding system is worse than none at all. Here's how to keep things fresh:

### Annual Review Checklist

Do this every summer before new board members start:

**Resources**
- [ ] Check all links still work
- [ ] Remove outdated resources
- [ ] Add new resources discovered during the year
- [ ] Update year-specific information (e.g., "2024-25" → "2025-26")

**Checklists**
- [ ] Review completion rates from last year
- [ ] Remove items that weren't useful
- [ ] Add new items based on feedback
- [ ] Reorder based on what's most important

**Event Catalog**
- [ ] Add any new events from the year
- [ ] Update budget and volunteer estimates with actuals
- [ ] Add tips learned from running events
- [ ] Archive events that are discontinued

**Handoff Notes**
- [ ] Remind outgoing board members to write them
- [ ] Review notes for sensitive information
- [ ] Thank contributors

**AI Guides**
- [ ] Regenerate guides with new information
- [ ] Review and publish updated guides to Knowledge Base

### Who Should Do This

Assign a specific person to own onboarding maintenance. Good candidates:
- PTA President or President-Elect
- Vice President
- Incoming board member who wants to contribute early

---

## Tips for Success

### Start Simple
Don't try to build everything at once. Start with:
1. Add 5-10 key resources
2. Create basic checklists for each position
3. Get handoff notes from current board
4. Generate AI guides

### Get Feedback
After new board members go through onboarding:
- Ask what was helpful
- Ask what was missing
- Ask what was confusing
- Use feedback to improve

### Make It Part of Culture
- Mention the onboarding hub at board meetings
- Thank people who contribute handoff notes
- Celebrate when new members complete their checklists
- Share success stories

### Connect to Other Features
The onboarding hub works best when connected to other DragonHub features:
- **Knowledge Base**: Reference articles in resources and guides
- **Event Planning**: Auto-generate catalog from completed events
- **Google Drive**: Index files for AI to reference
- **Minutes**: Let AI analyze meeting patterns

---

## Quick Reference: Where to Find Things

| What You Want to Do | Where to Go |
|---------------------|-------------|
| Add/edit resources | PTA Board Hub → Operations → Onboarding Config |
| Add/edit checklists | PTA Board Hub → Operations → Onboarding Config → Checklists |
| Manage event catalog | PTA Board Hub → Content & Communication → Event Catalog |
| View board member progress | PTA Board Hub → Operations → Onboarding Config |
| Write your handoff note | Board Onboarding Hub → Handoff Notes |
| Generate your AI guide | Board Onboarding Hub → AI Onboarding Guide |

---

## Need Help?

If you have questions about configuring the onboarding system:
1. Check the Knowledge Base for existing documentation
2. Ask other board members who've used the system
3. Contact your school admin for access issues
4. Report bugs or suggest improvements at [github.com/anthropics/claude-code/issues](https://github.com/anthropics/claude-code/issues)

---

*Last updated: February 2026*
