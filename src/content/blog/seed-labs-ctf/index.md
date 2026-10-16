---
title: 'Turning a SEED Labs security exercise into a team competition'
description: 'SEED Labs teaches computer security through hands-on exercises. We worked on a capture-the-flag application that gives each team a vulnerable service, lets them follow their attempts, and shows their captures on a live board.'
date: 2021-02-14
tags: [Security, SEED Labs, Docker, React, Flask]
hero: ./competition.png
heroAlt: 'An isometric technical drawing on cream grid paper titled A lab for each team. An instructor screen sends start, stop and restart requests to the Flask backend through the website proxy. The backend stores teams and sessions in MySQL and uses Docker to create separate vulnerable lab containers, each with a session secret and a published port. A team connects directly to its assigned lab port. Lab output returns to Flask, which sends live events to the React competition board. A dashed boundary encloses the website proxy, backend, database and labs on one Docker host. The footer says separate containers share the host kernel; the website proxy does not carry lab traffic.'
draft: true
---

SEED Labs is an educational project that gives students hands-on computer security exercises. They work with deliberately vulnerable programs and lab networks to understand how attacks happen and how protections work. We worked on a capture-the-flag application that turns a security exercise into a team competition.

An instructor starts a lab for a team, and the team gets a port to connect to. Behind it is a deliberately vulnerable service with a secret to recover. The team can watch its output and hints in the browser. When the service prints that secret, the competition board changes to show a capture.

This post covers how a team gets a lab, how the capture reaches the board, and the parts that still need work.

## Learning security by doing

The [SEED project](https://seedsecuritylabs.org/) develops teaching labs that instructors can use in their courses. The topics range from mistakes in software, such as buffer overflows, to web attacks, network attacks and cryptography. Its [2020 instructor workshops](https://seedsecuritylabs.org/workshops/workshop2020.html), for example, cover buffer overflow, SQL injection, packet sniffing and public-key security.

The idea is to make the lesson something a student can work through. In a buffer-overflow lab, students interact with a program containing that vulnerability and observe what happens. In a network lab, they work with network traffic. The exercise gives the security principle a concrete setting.

A capture-the-flag challenge adds a goal: recover a secret hidden inside the lab. Our application adds the team assignments, running services and shared display around that goal. The buffer-overflow server is the exercise; the website helps an instructor run it as a competition and makes each team's progress visible.

## An exercise becomes a competition

A vulnerable program is only one part of a team exercise. Someone also needs to assign it to a team, give that team somewhere to connect, choose how much help it gets, and recognise when it succeeds.

We put those jobs around the lab. The instructor's page creates teams with a name, a description and an optional flag image, then starts a session for a chosen team. The main board shows the running sessions, their ports, difficulty levels, attempts and successes. A smaller view reduces each card to the team's name and whether it has captured its flag, useful when the room only needs the overall picture.

Each card links to a session page with the lab's output and hints. The browser is the place to follow the exercise; the team sends its work directly to the lab's network port.

The application starts from a Flask and React starter project. React draws the pages, Flask handles the requests, and MySQL keeps the team and session records. We added the part that turns those records into running labs, and the connection that brings their output back to the page.

## Giving each team somewhere to work

Starting a session means creating both a database record and a running program. They have to agree about which team owns the lab, which secret it holds, and which port the team should use.

We use Docker containers: separate processes and filesystems packaged with the tools the lab needs. The backend can ask Docker to build and run one for each session. That gives each session its own copy of the exercise, while all the containers still share the host's kernel.

![An isometric lifecycle drawing on cream grid paper titled Starting a session takes more than one step. Four raised blocks run left to right: save a session marked building and generate its secret; build a session image with the secret and buffer settings; run the lab and ask Docker for its assigned port; save the container and port, mark the session running and start its watchers. Beneath them, restart loops back to the same container and refreshes the port; stop marks the session not running. A dashed branch from the build step points to a saved building record, labelled a failed build can leave this behind. The footer says stopping a session does not remove its image or container.](./session-lifecycle.png)

*The database record comes first. If the build fails, that record can remain even though the team never gets a running lab.*

One start request does four things:

1. **Make the session.** Generate a ten-letter secret and save a record for the team, initially marked as building.
2. **Build the lab.** Compile the vulnerable server with the selected buffer settings and put the secret into a file inside the session's image.
3. **Give it a port.** Start the container and let Docker assign a published port on the host.
4. **Start watching.** Save the container and port, mark the session as running, and start watching its output and availability.

The instructor can stop a session or restart its container. A restart keeps the same lab and secret; it refreshes the stored port, clears the error status and starts the log watchers again. Stopping marks the session as no longer running, so it leaves the board, but keeps its record.

The website has a different entrance. Nginx, a web proxy, forwards page and API requests to the application; a separate configuration adds HTTPS. The vulnerable lab ports are published directly by Docker. Putting HTTPS on the website doesn't change how teams reach their labs.

## Making the same lab harder

The implemented exercise is buffer overflow: a program copies more input into a fixed-size memory buffer than it can hold. The lab deliberately removes compiler protections so teams can study that mistake.

Rather than four unrelated programs, we have four levels of help around the same server. The instructor chooses the level and buffer size. Higher levels reveal less about the layout of the program's memory.

| Level | What the team is told |
|---|---|
| 1 | The buffer address and the stack frame address |
| 2 | The buffer address and a range for the buffer size |
| 3 | Ranges for both the buffer address and buffer size |
| 4 | No public hints from the server |

An address is a location in the program's memory. Giving an exact location is a much larger clue than giving a range, so the exercise can ask teams to do more of the discovery themselves. The instructor also has access to the server's answer details, separate from the public session data.

The architecture describes a broader choice of security modules, including format-string exercises. The application currently exposes one selectable lab, Buffer Overflow. Four difficulty levels aren't four different lab types.

## Getting a capture onto the board

The secret is the thing to recover. The optional team image is the flag that appears on the card afterward. They serve different purposes.

There isn't a browser form where a team pastes its answer. Instead, the backend watches the lab's ordinary output. If a chunk of output contains that session's secret, it increments the success count, marks the flag as captured, and tells the browsers to refresh.

<aside class="pull">A capture is something the running lab prints. The board hears about it through the backend.</aside>

The server also has a second output channel for control messages: a new connection was accepted, here are the hints, here are the instructor's answer details. Keeping these separate lets the backend count attempts and update hints without sending the instructor's answer into the team's visible log.

![A blueprint drawing on cream grid paper titled Two streams out, two ways to refresh. A lab block on the left sends ordinary output to a Flask watcher above and control records to another watcher below. Ordinary output becomes a live session log; if it contains the session secret, Flask saves a capture and emits a global success event. Control records update attempts, hints and instructor answer details; only the attempts and refresh notices go to the team page. MySQL stores the counters and capture status between the watchers and the screens. On the right the full board receives the success event and also polls every five seconds; the compact board polls every five seconds; the session page receives log, attempt and refresh events and fetches its session every sixty seconds. A footer says live log output has no replay here, and event names are not per-team access controls.](./live-updates.png)

*Live events make the page react promptly. Periodic requests fetch the saved state again. They don't recover missing log output.*

For the live connection we use Socket.IO, which lets the server send events to a browser without waiting for another page request. Logs and attempt counts have session-specific event names. A successful capture also produces a shared event for the full competition board, which refreshes its cards and tries to play a victory sound.

That connection isn't the only way the pages stay current. Both boards fetch the running sessions every five seconds. The team page fetches its own session every minute, as well as responding to live refresh events. The compact board uses polling alone.

## From the first version to clearer boundaries

The first public version arrived in March 2020. April brought the HTTPS configuration, explicit API schemas, a split of the team, session and form routes, and logging changes. The architecture documentation followed in February 2021.

The schemas make one boundary particularly clear: public session responses leave out the secret and the instructor's answer. The administrator's response includes them. That matters when the same session record drives both the instructor's controls and the page a team can open.

There's another boundary between what can be saved and what has to keep running. MySQL remembers the session and its counters. The watchers following the containers live in the backend process. Creating a session starts them; the administrator's session listing also tries to attach watchers to running containers. A saved row alone isn't enough to keep the live output flowing.

## What's still rough

**Attempts aren't just team attempts.** The server counts each accepted connection. The backend also connects once a minute to check whether the lab responds, so those health checks can increase the attempt count. It's a connection count, not a clean measure of how many solutions a team tried.

**A capture can count more than once.** The watcher looks for the secret inside each output chunk. Repeated matching output can increment the success count again. Clearing the displayed flag resets its captured status, not that count. This isn't a ranked scoreboard with one durable award per round.

**Reconnecting doesn't replay the log.** The team page asks to fetch logs when its live connection opens, but the backend has no matching handler for that request. Logs depend on the watchers already running, and a newly opened page starts with fresh visible output. Polling recovers session details, not earlier log lines.

**Stopping isn't cleanup.** Stopped containers and their images remain. A failed build can leave an unfinished session record, and the database migration only describes an older teams table. Startup creates missing tables, but that doesn't provide a complete way to upgrade an existing database.

**The host remains part of the lab.** The backend controls Docker through its host socket, and containers share a kernel. Administration uses a shared token, some requests put it in the URL, and the public flag-reset operation has no token check. Socket events are broadcast; having a session number in the event name doesn't make a private channel. This needs stronger boundaries before it becomes a service for untrusted groups.

## What we'd tell someone starting out

1. **Follow one team all the way through.** A team record, a lab container, a port and a captured flag need to describe the same session.
2. **Decide what counts as success.** A secret appearing in output is easy to recognise, but repeated output needs a rule if it should count only once.
3. **Keep help separate from the answer.** Public hints and instructor details need different paths to the screen.
4. **Use live events alongside saved state.** Refreshing the database view can repair stale cards; replaying a log needs its own design.
5. **Plan the end of a lab as carefully as the start.** Stop, restart, failed builds and resource cleanup all need explicit behavior.

The useful part is the loop: give a team a lab, let it see what is happening, and make its capture visible to the room.

## The code

The project is [seed-labs/ctf-app](https://github.com/seed-labs/ctf-app), described here at [commit 0421689](https://github.com/seed-labs/ctf-app/tree/0421689869293ea3772de8f81ad754e356841776). The [backend](https://github.com/seed-labs/ctf-app/blob/0421689869293ea3772de8f81ad754e356841776/server/app/__init__.py) connects lab creation to the output watchers; the [vulnerable server](https://github.com/seed-labs/ctf-app/blob/0421689869293ea3772de8f81ad754e356841776/docker/bof_vulnerable_server.c) produces the exercise and its hints.

## Credits

This was a team effort for SEED Labs. The application builds on the Yale Digital Humanities Lab's Flask/React starter and the open-source React, Flask, Socket.IO, Docker, Nginx and MySQL projects.
