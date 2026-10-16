---
title: 'Building a multi-agent realtor in a day — and what a real one would need'
description: 'You paste a house listing into a chat, and a small team of AI agents sizes it up, looks for similar homes and tells you which contract forms an offer needs. Four of us built it in one day at a hackathon. Here is what was real, what was a demo, and what a version you could trust would need.'
date: 2025-02-22
tags: [AI Agents, smolagents, Hackathon, Real Estate]
hero: ./system.png
heroAlt: 'A technical drawing on cream grid paper, labelled Fig. 01, one manager, three specialists. On the left, a chat window drawn as an isometric panel with lines of messages on its face, with a callout: Gradio chat, smolagents'' built-in chat window, shows thoughts, code and tool calls. Two arrows link it to a large shaded isometric cube in the middle: your question plus listing URL goes to the cube, and the answer, every step shown, comes back. The cube is labelled Manager, a CodeAgent with no prompt of its own, and a callout from it reads human_intervention: asks you on the server''s terminal. From the manager, three lines labelled agent(task=…) fan out to three smaller cubes on the right, the specialists, each with its own tools: realtor_agent reads one listing page and works out dollars per square foot; comparable_agent searches the web for similar homes, with links; document_agent searches 14 contract forms and says which apply. A return arrow runs from the specialists back into the manager, labelled report, comps, which forms. A title block at the top reads Realtor Agent. Built: 22 Feb 2025, in one day. Agents: smolagents CodeAgents. Model: GPT-4o via LiteLLM, shared. Tracing: OpenTelemetry to Arize.'
draft: true
---

You paste a link to a house listing into a chat window and ask: is this a good buy? The assistant reads the listing and works out the price per square foot, the tax and an estimated monthly payment. Ask it for comparable homes and it goes looking for similar places nearby, with links to where it found them. Ask what you'd need to make an offer and it tells you which contract forms apply.

Behind that chat window there isn't one assistant but four: a manager that reads your question and hands the work to three specialists, one for the listing, one for comparable homes and one for the paperwork.

Four of us built it in one day, at a hackathon on 22 February 2025. It was a team effort from the first commit to the last. Some of what it did was real, and some of it only looked real in a demo. This post covers how it came together, where it was thinner than it looked, and what a version you'd actually trust with a house purchase would need.

## Three chores and one Saturday

Buying a house comes with three chores that eat whole evenings. You look hard at one listing and try to work out whether the price makes sense. You hunt for comparable homes nearby to check that hunch. And when you're ready to make an offer, you work out which contract forms you need.

The event was [Open Source AI Hackathon #14 – AI Agents](https://lu.ma/0csh7daf) in Redmond, a one-day hackathon about AI agents. Our first commit landed at 11:38 in the morning and our last at 17:15, with 44 commits in between.

Here's the order things came together in. First a tool for asking a human a question. Then search over a library of contract forms. Then the code to pull listing data from a web page. Only in the middle of the afternoon did we wire the pieces into a team of agents, and in the last hour and a half we switched models and recorded the demo.

## A manager and three specialists

We built on Hugging Face's [smolagents](https://github.com/huggingface/smolagents) library. Its big idea is that an agent doesn't answer by filling in a form saying "call this tool with these settings". It writes a few lines of Python that call its tools like ordinary functions, and smolagents runs that code. That suits a job like ours, where the agent has to fetch data, do some arithmetic on it and combine the results.

smolagents also lets one agent manage others. You give the manager a list of helper agents, and it can call each of them like a function from the code it writes.

So we set it up like a small office. The manager has no instructions of its own. It decides who to ask purely from each specialist's job description, a short paragraph of plain English:

| Specialist | Its job description asks it to… | What it has to work with |
|---|---|---|
| **Listing analyst** (`realtor_agent`) | load the listing, work out price per square foot and an "estimated ROI", assess it as an investment and write a report, and "not make up information" | a tool that loads a listing page |
| **Comps researcher** (`comparable_agent`) | find similar homes nearby, the neighbourhood, price trends, schools, transport and recent news, "with links to the sources" | web search, a web-page reader and a Python interpreter |
| **Paperwork clerk** (`document_agent`) | explain which contract forms apply to this kind of property, and what they contain | search over a small library of contract forms |

Those job descriptions are the real program: they're all the manager has to go on when it decides who to ask.

All four agents shared one model, GPT-4o, reached through LiteLLM. That wasn't where we started: we swapped out an earlier model and key about an hour and a half before the end, and one experimental branch tried a Qwen coding model on Groq. Every step was traced from the start. The app won't even launch without tracing credentials for Arize, and every thought, tool call and token count lands in a trace. With four agents passing work around, that was the only practical way to see why the manager did what it did.

## One question, start to finish

Here's roughly what happens when you paste in a listing and ask for an analysis and some comps.

![A sequence diagram on grid paper titled "Who talks to whom", Fig. 02, one conversation in two turns, with six columns: You, Gradio, Manager, realtor_agent, comparable_agent and document_agent. A subtitle says it is an illustrative run: the manager’s LLM picks the calls and their order, and nothing in the code enforces this sequence. Turn 1, "Analyse this listing and find comps": 1, you send a question and listing URL to Gradio; 2, Gradio passes the task to the manager; 3, the manager calls realtor_agent(task=…) in generated Python; 4, realtor_agent runs load_realtor_data(url), and the raw page JSON goes to LLM-written Python that works out dollars per square foot and so on; 5, it returns a property report to the manager; 6, the manager calls comparable_agent(task=…); 7, comparable_agent runs web searches and visits pages for similar homes, area notes and links; 8, it returns summaries with links; 9, the manager’s final_answer goes back to you, with every step shown in the chat. Turn 2, "What documents do we need for an offer?": 10, the manager calls document_agent(task=…), which uses the BM25 retriever to say which forms apply.](./sequence.png)

1. **The manager reads your question** and writes a line of Python that hands the listing to the listing analyst.
2. **The listing analyst loads the page** and writes its own Python to work out the numbers. There's no formula for price per square foot anywhere in our code: the model writes one fresh every time.
3. **The manager calls the comps researcher**, which searches the web, reads pages and sums up what it found, with links.
4. **The manager writes the answer**, and the chat shows every step along the way: the model's reasoning, the code it wrote, what each tool returned.

The demo we recorded at the end of the day shows the listing half of this: a summary with the price, price per square foot, beds and baths, tax and an estimated monthly payment, followed by a question about which documents an offer needs, answered by the paperwork clerk.

## Reading a listing without an API

We had no listing API, so the listing analyst reads the web page itself. That turned out to be easier than it sounds. realtor.com builds its pages with a framework that tucks all of the page's data into the page as one big block of JSON. So the tool fetches the page with browser-like headers, pulls out that block and hands the whole thing to the model, unfiltered. The model is happy to dig through it for the price and the square footage.

It was a great hackathon shortcut: nothing to sign up for, no parser to write. It's also the most fragile part of the system. It depends on one site's page internals, has no retries, caching or rate limiting, and scraping a site like this may well be against its terms.

## Comps by asking the web

This is the part to be most upfront about: **there's no comps algorithm.** The comps researcher has web search, a page reader and its job description, and that's all. No filters for distance, size, bedrooms or how recent a sale was. No scoring, no adjustments.

So the comps were whatever the model found that day. For a demo that's fine: the answers look plausible and come with links. As the basis for a real offer it isn't, because you can't explain or repeat how a given home made the list.

## Finding the right form

For the paperwork we bundled a small library of 14 blank state real-estate contract forms, and gave the clerk a way to search them.

![A pipeline drawing on grid paper titled "Keyword search over a stack of forms", Fig. 03, the contract-form retriever. Subtitle: built in memory at import time, every time the app starts; no embeddings, no vector store. Five numbered boxes run left to right: 1, 14 form PDFs, a small library of blank state real-estate contract forms; 2, PyPDFLoader via DirectoryLoader on *.pdf, one document per page, keeping file name and page; 3, a recursive text splitter with 1,000-character chunks, 200 overlap, splitting on paragraph, then line, then sentence; 4, BM25Retriever, lexical scoring, k equals 5 chunks, rebuilt on every start; 5, the retriever tool, which returns file name, page number and chunk text for the top 5. The retriever tool feeds document_agent, whose example question is "which forms do we need for a single-family home?". document_agent also calls real_estate_expert, which runs the same retrieval and then dispatches by form number to analyze functions. Those sit in a dashed box marked "the stubbed part": five analysis methods whose bodies are all pass, so they return None. Footer: good at exact terms such as "escalation", "inspection" or a form number; weak when the question uses different words than the form. One branch asks for a "financing" analysis type that was never registered, so it returns "Document type not supported".](./rag.png)

The search is deliberately old-fashioned. Each form is split into chunks of about 1,000 characters, overlapping by 200 so a sentence isn't lost at a boundary. The chunks are ranked with BM25, a classic keyword-scoring method that works a bit like a library index: it rewards chunks that use your exact words, especially rare ones. The top five come back with the file name and page number, so the clerk can say which form and where. There's no AI model in the search itself, and the whole index is rebuilt in memory every time the app starts.

Keyword search is a good match for contracts, which are full of exact terms like "escalation", "inspection" or a form number. It struggles when you ask in everyday words that never appear in the form.

## What was real, and what was a demo

A hackathon demo is good at hiding the seams, so here they are.

**Contract "finalization" was a stub.** The project description promises help with "contract document finalization". What the code actually does is find and explain which forms apply. There is a tool for analysing a contract, an appraisal, an inspection, a title or a mortgage, but every one of those five methods is empty. Nothing fills in a form, drafts a clause or produces a document.

**The numbers came from the model.** Price per square foot, "estimated ROI" and investment potential exist only as instructions in a job description. The model writes the arithmetic each time, so two runs can do it differently.

**Comps came from web search**, as above.

**The human in the loop was in the wrong room.** We wrote a neat tool for asking a person a question, with three modes: an open question, a yes/no approval and a multiple choice. But it waits for the answer on the server's terminal, not in the chat window the user is looking at. And nothing forces any agent to use it.

What did work: the manager handing work to its specialists, the live listing read and the form search all ran end to end, and the traces made it explainable on stage. For about five and a half hours of commits from a team of four, that's a fair result. It's also a long way from something you'd use to buy a house.

## What a real one would need

![A two-column drawing on grid paper titled "What we built, and what a real one would need", Fig. 04, demo vs. production. Subtitle: left is the code as it stands; right is my view of the minimum before anyone should trust it with a real purchase. The left frame, dashed, is headed Built in a day; the right, solid, is headed A real one would need. Seven rows, each with an arrow from left to right. Listing data: scrape one realtor.com page with raw JSON to the LLM, becomes licensed data, an MLS feed or listing API parsed into a typed schema. Comps: whatever web search finds, becomes comps as code: filter by radius, beds and baths, size and recency, then score, then adjust. Metrics: Python the LLM writes fresh on every run, becomes tested functions: same inputs, same answer, and the agent only explains them. Contract forms: find which forms apply, analysis methods are stubs, becomes fill plus review gate: draft from structured data, and a licensed human signs off. Human in the loop: optional and reads the server’s terminal, becomes required, in the UI: approvals the user sees, logged with the trace. Guardrails: "do not make up information" in each prompt, becomes real guardrails: PII handling, consent, a jurisdiction check and "not legal advice". Evals: none, traces only, becomes evals: a fixed set of listings and questions run on every change. A footnote says the right-hand column is opinion, not something the repo implements.](./gap.png)

The right-hand side of that drawing is opinion, not something we built, but most of it follows from the gaps above.

**Licensed data, in a fixed shape.** Listing data should come from a source you're allowed to use, such as an MLS feed or a listing API, and be turned into a typed record before the model sees it. A raw page dump is fragile, and it's full of fields the model doesn't need, which can include details about the listing agent and office.

**Comps as code.** Picking comparable homes is a well-understood process: filter by distance, size, bedrooms and bathrooms and sale date, score what's left, then adjust for the differences. That belongs in a tested tool. The agent's job is to call it and explain the result, not to invent the method each time.

**Numbers from tested functions**, for the same reason: same inputs, same answer.

**Form filling with a hard stop for review.** The useful version of "contract finalization" is filling in a form from structured data and showing a licensed person a clear diff to approve. That approval has to be required, has to happen in the app, and has to be recorded.

**Data and legal guardrails.** Your messages and the listing data went to a hosted model and a tracing service, with no redaction, consent or retention policy. A real product needs all of those, a check that the forms match where the property is, and a clear statement that it isn't legal advice.

**Evals.** A fixed set of listings and questions with known good answers, run on every change. The tracing we wired in on day one would make that much easier to build.

## What's still rough

This is where the project stands at the end of the day, rough edges included.

**The listing read is brittle.** One change to the site's pages and it stops working.

**A job description points at the wrong colleague.** The comps researcher is told, in its last step, to use the listing analyst, but it has no way to reach it. Only the manager can.

**One paperwork branch asks for something that doesn't exist.** Ask about a financing form and the analysis step asks for a "financing" type that was never set up, so it answers "Document type not supported".

**The labels drifted.** The forms we bundled come from one state, but the names in the code refer to a different state's forms. It's harmless in a demo, and exactly the kind of mistake that matters in real estate, where the right form depends on where the house is.

**Model-written code runs on your machine.** The manager and the comps researcher run the Python the model writes, locally, with smolagents' default settings.

**There are no tests.** The traces show what happened on a run, but nothing checks whether the answers were right.

## What we'd tell someone starting out

1. **Job descriptions are code.** When the manager has no instructions of its own, the specialists' descriptions are the routing logic. Write and review them like functions.
2. **Turn on tracing first.** It cost us almost nothing, and it was the only way to follow four agents passing work around.
3. **Put the human where the human is.** A prompt on the server's terminal isn't human review.
4. **Let code do the maths.** If a number matters, compute it in a tested function and let the model explain it.
5. **Be honest about stubs.** A one-line "what's stubbed" note would have set expectations better than any feature list.

A manager handing work to specialists, each with a narrow job and its own tools, was easy to explain, easy to trace and quick to build in a day. What's left is everything that makes the answers trustworthy.

## The code

The project is on GitHub at [tysonthomas9/realtor-agent](https://github.com/tysonthomas9/realtor-agent) (MIT licence), as it stands at the end of the hackathon. The whole app, including the manager and the three specialists, is in [`demo.py`](https://github.com/tysonthomas9/realtor-agent/blob/0b406de995a4c508ed453ba208a54d9f59a5308b/demo.py).

## Credits

This was a team effort by the four of us who built it that day. It stands on open-source work: Hugging Face's [smolagents](https://github.com/huggingface/smolagents) for the agents and their chat interface, [Gradio](https://www.gradio.app) underneath that, [LiteLLM](https://github.com/BerriAI/litellm) for the model connection, [LangChain](https://github.com/langchain-ai/langchain) for loading, splitting and keyword-searching the forms, and OpenTelemetry with OpenInference's smolagents instrumentation for tracing.
