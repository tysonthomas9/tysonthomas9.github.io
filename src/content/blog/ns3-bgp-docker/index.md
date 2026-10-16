---
title: 'From hello-world to BGP: a slice of the internet in three containers'
description: 'Three simulated BGP routers, each in its own Docker container, peering as if they shared a wire, with real traffic able to come in on one side and leave on the other. How it came together, starting from Docker basics.'
date: 2019-10-10
tags: [Networking, ns-3, BGP, Docker, Containers, Tutorial]
hero: ./topology.png
heroAlt: 'An isometric technical drawing on cream grid paper, labelled Fig. 01, the whole setup. A table at the top left is titled Three containers, one simulated BGP network, with three rows: SU, su_edge, AS11872, announces the campus prefix; NYSERNET, nysernet_rs, AS3754, route server, announces nothing; GOOGLE, google_edge, AS15169, announces a Google prefix. Below it, a long flat slab is labelled one Docker host, Compose network sim. Three shaded blocks stand on it in a diagonal row, labelled SU, NYSERNET and GOOGLE, each marked ns-3.30, real time, and each with a smaller cube on top for its router. Thick curved lines labelled BGP join the SU router to the NYSERNET router and the NYSERNET router to the GOOGLE router; a callout on the SU router reads su_edge, AS11872, the campus edge. Dashed lines run from all three router cubes up to a cube floating at the top right, labelled bridge-distribute, port 9090, network id 1, joins the three copies of the shared LAN, runs separately. On the left, a dashed-outline cube outside the host has an arrow into the SU block, labelled VPN in: a VPN client, assumed, OpenVPN on UDP 1201 to 1194, into br0, which is tap1 plus tap0. On the right, an arrow leaves the GOOGLE block for another dashed-outline cube, labelled NAT out: tap0 at 10.0.0.1, NAT with MASQUERADE, to the real internet. A footer explains that dashed lines are frames on the shared LAN through the distribution server, thick lines are BGP sessions, dashed outlines are outside the host, and 10.0.0.1 is a private address.'
draft: true
---

Picture a small corner of the internet: a campus network, the regional network it connects through, and Google. Each has a router at its edge, and those routers tell each other which addresses they can reach. Now picture all three routers running as simulations on one machine, one per Docker container, talking to each other as if they shared a wire.

That's what we developed this autumn, for course and research work. The routers speak BGP, the protocol networks use to announce their routes to each other. And because the simulator can hand packets to real network interfaces, real traffic can join in: it can come in through a VPN on the campus side, cross the simulated routers, and leave for the real internet on the Google side.

This post covers how I got there: the Docker basics I worked through first, how one container became three, how the simulated routers find each other and the real world, what changed on the last day, and what's still rough.

## A network you can run on one machine

[ns-3](https://www.nsnam.org/) is a network simulator. You describe nodes, links and protocols in C++, and it plays out what happens to every packet. Normally it runs as fast as it can, but it can also run in real time and pass packets to and from real Linux interfaces. Then a simulated network can carry real traffic.

ns-3 doesn't speak BGP out of the box, so the BGP part comes from open-source projects by [Nat-Lab](https://github.com/Nat-Lab): a C++ BGP library, libbgp, and ns3-bgp, a BGP router application for ns-3 built on it. A third project, ns3-distributed-bridge, does something unusual: it connects a simulated network to a "distribution server" somewhere else, so separate simulations can share one network. That turned out to be the key piece.

The three routers borrow real, public AS numbers (the numbers networks use to identify themselves in BGP):

| Container | Router | AS number | Its job |
|---|---|---|---|
| **su** | `su_edge` | AS11872 | The campus edge. Announces the campus prefix. |
| **nysernet** | `nysernet_rs` | AS3754 | The regional network's route server. Peers with both edges, announces nothing itself. |
| **google** | `google_edge` | AS15169 | Google's edge. Announces a Google prefix. |

So the simulation is a scaled-down picture of a campus edge router and Google reaching each other through a regional network's route server.

## Learning the container tricks first

Around the same time I wrote a short README called **Hello Docker!!**, a "hands on exploration of docker capabilities" (October 4, 2019). It isn't theory. It's a list of commands you type one after another until containers stop feeling like magic.

It starts gently. `docker run hello-world` pulls a tiny image from Docker Hub and prints "Hello from Docker!". `docker pull busybox` fetches a small Linux toolbox, and `docker images` shows it arrived. That's the moment to ask how a container differs from a virtual machine: a VM carries a whole guest operating system, while a container is just isolated processes sharing the host's kernel.

![An isometric technical drawing on cream grid paper, labelled Fig. 02, titled Containers vs virtual machines, with the subtitle: Each VM carries its own operating system; containers share the host's kernel. On the left, labelled virtual machines, is a stack of 3D blocks: an infrastructure slab, a hypervisor slab on it, and on top three towers, each made of a hatched guest OS block, a bins / libs block and an app block, for apps A, B and C. Callouts say the guest OS is a full operating system in every VM, and the hypervisor runs the VMs. On the right, labelled containers, Docker, the stack is an infrastructure slab, a hatched host OS slab, a Docker Engine slab, and three shorter towers of just bins / libs and an app, for apps A, B and C. Callouts say the host OS is one shared kernel, and that the towers have no guest OS, just libraries and the app. A footnote says hatched blocks are operating systems, and quotes Docker: each VM includes a full copy of an operating system (tens of GBs), while container images are typically tens of MBs. Source: docker.com/resources/what-container.](./containers-vs-vms.png)

*Notice what's missing on the right: no hatched guest operating system in each tower, just one shared kernel underneath.*

From there the README gets hands-on. `docker run -it busybox sh` opens a shell inside a container (`-i` keeps it interactive, `-t` gives it a terminal), and `ip address` inside shows a loopback interface and an `eth0` on Docker's default bridge network. `--env VAR1=value1` passes settings in. `docker ps`, `docker ps -a`, `docker stop` and `docker rm` list, stop and clean up containers. A small Flask app, built into an image called `friendlyhello` on `python:2.7-slim`, answers on port 4000 with "Hello World!", the container's ID as its hostname, and "cannot connect to Redis, counter disabled", which is expected, because nothing called `redis` is running. `docker history friendlyhello` lists the image's layers, and the `pip install` layer is the big one.

Four of the README's exercises turned out to be exactly what the BGP setup needs later:

| In the README | What it shows | Where it comes back |
|---|---|---|
| `--device=/dev/sda:/dev/xvdc` | Hand a host device to a container under a new name | The routers get `/dev/net` so they can create virtual network interfaces |
| `--privileged` | Without it, `mount -t tmpfs none /mnt` fails with "permission denied"; with it, it works | The routers get one narrower permission instead, `NET_ADMIN`, to change interfaces and routes |
| `-p 8080:80` and `-P` | Publish a container's port on the host (nginx on 8080, or a random high port) | Each router container publishes a UDP port for OpenVPN |
| `docker network create --subnet 10.0.0.0/24 my_bridge` | A user-defined bridge network, where containers find each other by name | The three router containers share one such network |

That last one is worth a picture. On a user-defined bridge, a container named `c3`, pinned to `10.0.0.254` with `--ip`, can `ping c2` by name, because user-defined bridges resolve container names automatically. On the default bridge, containers only reach each other by IP address. `10.0.0.0/24` is a private range, so it's safe for a demo.

![An isometric technical drawing on cream grid paper, labelled Fig. 03, titled A user-defined bridge network, with the subtitle: Containers on my_bridge can reach each other by name, not just by IP address. A flat slab labelled Docker host carries a hatched slab labelled my_bridge, driver bridge, 10.0.0.0/24. Two cube-shaped containers stand on it, each labelled busybox sh: C2 at the back, with a callout saying 10.0.0.x, picked by Docker, and C3 in front, with a callout saying 10.0.0.254, pinned with --ip. A dashed curved arrow goes from C3 over to C2, tagged ping c2, with the note: the name c2 resolves to c2's IP. At the right are the commands: docker network create -d bridge --subnet 10.0.0.0/24 my_bridge; docker run --rm -itd --name c2 --net my_bridge busybox sh; docker run --rm -it --name c3 --net my_bridge --ip 10.0.0.254 busybox sh; and then ping c2 inside c3. A footnote says 10.0.0.0/24 is a private range, safe for a demo, and that on the default bridge, containers only reach each other by IP address.](./bridge-network.png)

*The dashed arrow is the point: `c3` reaches `c2` by name, and Docker picks `c2`'s address.*

## One image, then three

The simulation started as one Docker image (September 30 to October 2, 2019). It starts from Ubuntu 16.04, installs a long list of build tools and libraries for ns-3 and its optional extras (compilers, Python 2, Qt, GSL, SQLite, Boost and so on), downloads ns-3.30, and builds it with Nat-Lab's add-ons inside. ns-3.30 is brand new: it was released on August 21, 2019, and updated to 3.30.1 on September 18.

On October 10 it became three images, one per router. Each one builds the same environment and then runs a different router. Building ns-3 inside a container takes a while, and these images do it twice: once with the BGP module, and again after the distributed bridge is added.

![An isometric technical drawing on cream grid paper, labelled Fig. 04, one build, three endings, titled What goes into each router image, with the subtitle: Three Dockerfiles: the same eleven steps, then a different ending for each router. A tall block is built from eleven stacked slabs, numbered from the bottom, each with a callout on the right: 01, FROM ubuntu:16.04, the base image. 02, apt-get install: compilers, Python 2, Qt5, GSL, SQLite, Boost, autotools. 03, ns-allinone-3.30, downloaded from nsnam.org, unpacked in /usr. 04, libbgp: git clone, autogen, configure, make install. 05, ns3-bgp into src/bgp, the BGP router app for ns-3. 06, ./build.py, the first ns-3 build, with the BGP module. 07, apt-get install: openvpn, net-tools, traceroute, ping, bridge-utils, curl, netcat. 08, ns3-distributed-bridge, cloned into src/distributed-bridge. 09, ./build.py, the second ns-3 build, which picks up the bridge. 10, ADD nets/ into scratch/: nysernet.cc, su.cc and google.cc, with waf linked into /usr/bin. 11, ENV NS_LOG, Bgp=all and BgpLog=all. Slabs 04, 05 and 08 are hatched. On top stand three smaller blocks, one per image. GOOGLE has two slabs: a lower slab adding uml-utilities and script.sh, and a top slab, CMD ./script.sh && waf --run google. SU has the same lower slab and a top slab, CMD ./script.sh. NYSERNET has one slab, CMD waf --run nysernet. A footnote says hatched slabs are cloned from Nat-Lab with git clone, not pinned to a commit, and only the top slabs differ between the three images.](./image-layers.png)

*Only the small blocks on top differ between the three images. Everything below is the same long build, and the hatched slabs are the Nat-Lab pieces, cloned straight from their default branches.*

A Compose file starts the three containers together on one bridge network, `sim`. Each container gets `NET_ADMIN` and `/dev/net`, the two tricks from the README, and publishes one UDP port for OpenVPN: 1200 for nysernet, 1201 for su and 1202 for google, all mapped to OpenVPN's port 1194 inside. The two edge routers start after the route server.

## Three routers that can't see each other

Here's the catch with one router per container. Each simulation runs in its own process, so each one has its own private copy of the network they're supposed to share. A router in one container can't see a router in another.

The distributed bridge fixes that. Each simulation puts a bridge node on its copy of the shared network, and every frame on it goes to the distribution server on port 9090. The server passes it to everyone else on network 1. Three copies of a network become one, and the routers peer with each other as if they were on the same wire. The server, bridge-distribute, isn't part of my repos; it runs separately.

The routers themselves are short C++ programs. I didn't write them by hand: they were generated with Nat-Lab's [ns3-bgp-netgen-ng](https://github.com/Nat-Lab/ns3-bgp-netgen-ng), which turns a JSON description of routers, networks and peerings into ns3-bgp code. Each program switches ns-3 to real time, because it exchanges packets with real devices and has to keep pace with the clock. The BGP part reads almost like a router config. This is the campus edge (real addresses replaced with placeholders in angle brackets):

```cpp
Peer bgp_router_su_edge_peer_0;
bgp_router_su_edge_peer_0.peer_address =
    "<NYSERNET_RS_ADDR>";
bgp_router_su_edge_peer_0.peer_asn = 3754;
bgp_router_su_edge_peer_0.local_asn = 11872;
bgp_router_su_edge->AddPeer(
    bgp_router_su_edge_peer_0);
bgp_router_su_edge->AddRoute("<SU_PREFIX>",
    Ipv4Mask("/16"), "<SU_GATEWAY>");
```

In words: I'm AS11872, open a session to the route server in AS3754, and announce the campus /16. The Google edge mirrors it as AS15169. The route server peers with both and announces nothing of its own. All three images contain all three programs; the start command picks one.

## Letting real traffic in

A simulated network on its own is a closed box. To let real packets in, each edge router has a second simulated network with a "tap node" on it, connected to a Linux **tap device**: a virtual network card that a program, here ns-3, sits behind. ns-3's TapBridge does the connecting, and the two edges use it in different modes.

**The campus side bridges.** A startup script builds a Linux bridge, `br0`, out of two tap devices, `tap1` and `tap0`, gives it the campus gateway address, starts OpenVPN, and then starts the simulation. The simulation attaches to `tap1` in **UseBridge** mode, which extends the Linux bridge into ns-3. `tap0` sits on the same bridge, and a tap-mode OpenVPN server on it would put VPN clients straight onto the simulated campus network. The OpenVPN config isn't in the repo, so that part is my reading of the setup, and the drawing at the top marks it as assumed.

**The Google side NATs.** Here the simulation creates `tap0` itself in **ConfigureLocal** mode, giving it `10.0.0.1` on a small private network where the Google edge router is `10.0.0.2`. A startup script turns on NAT for everything leaving the container. Then, ten seconds after the simulation starts, it routes the campus prefix back into the simulation through `tap0`. Traffic the simulated Google router sends to `10.0.0.1` comes out of `tap0` and leaves through NAT for the real internet, and replies for the campus find their way back in.

Both scripts also add a route to the distribution server through Docker's own network, so the bridge traffic doesn't wander into the simulation.

## Three fixes the same day

The three-container version went in shortly after midnight on October 10, and a second commit that evening, "Updated the startup scripts", changed three things:

- **The campus tap moved.** The simulation's tap device on the campus side changed from `tap0` to `tap1`, the one the bridge script hands it, leaving `tap0` on the bridge for the other side.
- **The Google side got its script.** The NAT rule and the delayed route back to the campus prefix were added, and the container now runs the script before the simulation.
- **The VPN ports became UDP.** The published ports were marked `/udp`, which is what OpenVPN uses by default, and the OpenVPN config was mounted from a different folder.

The repo doesn't record what went wrong before these changes, only what changed.

## Watching it come up

Here's what the setup tells you to look for.

**The build.** Each image ends its second ns-3 build with waf's summary. Both add-ons should be in the list of modules built, as `bgp (no Python)` and `distributed-bridge (no Python)`, which just means they have no Python bindings. A few optional modules (brite, click, openflow and the visualizer) aren't built, and that's fine. The three router programs are compiled the first time you run `waf`.

**The campus container.** Its script prints the interfaces with `ifconfig`, then the routing table with `route -n`, which should include the route to the distribution server via Docker's gateway. It runs `traceroute google.com`, prints the interfaces again, now with `br0`, `tap0` and `tap1`, starts OpenVPN, and hands over to the simulation.

**The Google container.** Its script prints nothing. Ten seconds after the simulation starts, `tap0` gets its route to the campus prefix.

**The BGP sessions.** Every container sets `NS_LOG="Bgp=all|prefix_all:BgpLog=all|prefix_all"`, which turns on ns3-bgp's router log and libbgp's own log, with the simulation time, node and function at the start of each line. The lines to watch are the session state changes, logged as `BgpFsm::setState: changing state: <from> -> <to>`. A healthy session goes from `Idle` through `Open Sent` and `Open Confirm` to `Established`.

**No ending.** The simulations run with no stop time, so the routers keep going until you stop the containers.

## What's still rough

**Pieces that aren't in the repo.** The distribution server, the OpenVPN config and a `test.cc` file that the first image tries to copy aren't committed. Without `test.cc`, the first image doesn't build; delete that line or add your own program. (The path it copies to, `ns-3.30/src/scratch/`, isn't ns-3's scratch folder anyway; that's `ns-3.30/scratch/`.)

**Hard-wired addresses.** The routers and scripts point at real public addresses for the campus, Google and the distribution server. To run it elsewhere you'd change them in the three programs and two scripts.

**A duplicated line.** The campus service in the Compose file has `volumes:` on two lines in a row. Delete one.

**Unpinned parts.** The images clone Nat-Lab's projects from their default branches, so a later build gets whatever is on those branches when it runs.

**No results yet.** The repos don't include logs, captures or measurements, so this post can't show it carrying traffic end to end.

## If you try it yourself

For the Docker warm-up you need Docker installed and running (`docker version` should show both a Client and a Server section), a terminal, `curl` or a browser, and about 15 minutes. You'll pull a few small images: `hello-world`, `busybox`, `ubuntu`, `nginx` and a Python base image. For the BGP setup you also need a Linux host with Docker Compose, time and disk space for two ns-3 builds per image, a bridge-distribute server that all three containers can reach on port 9090, and, for the VPN side, your own OpenVPN config. The command is `docker-compose up --build`.

A few things trip people up:

- **Two commands delete everything.** The README's `docker stop $(docker ps -q)` and `docker rm $(docker ps -aq -f status=exited)` stop and delete *every* container on the machine. To clean up only the tutorial, use `docker rm -f static-site static-site2`.
- **Port already in use.** Something else is on 8080 or 4000. Change the left-hand number, for example `-p 18080:80`.
- **Name already in use.** Container names like `static-site` must be unique, even for stopped containers. `docker rm -f static-site`, or pick a new name.
- **`fdisk` can't open the device.** Your disk probably isn't `/dev/sda`; check with `lsblk`. `fdisk` edits partition tables, so press `q` and nothing else.
- **`mount` still fails.** The second container needs `--privileged`; `-t -i` alone isn't enough. `--privileged` gives a container almost full access to the host, so only use it when you need it.
- **"Operation not permitted" from `tunctl` or `ip route`.** The container needs `NET_ADMIN` and `/dev/net`. The Compose file grants both; with plain `docker run`, add `--cap-add NET_ADMIN --device /dev/net/tun`.
- **The routers never peer.** They only share a network through the distribution server. Check it's running, that its address is right in the programs and scripts, and that the containers can reach it on port 9090.

## What I'd tell someone starting out

1. **Learn the container basics before the project.** Devices, capabilities, published ports and user-defined networks were all in a beginner's README, and the BGP setup used every one of them.
2. **Give each simulation its own container, and a shared wire between them.** Separate processes can't see each other's networks until something like the distributed bridge joins them.
3. **Run in real time when real packets are involved.** A simulation that talks to real interfaces has to keep pace with the clock.
4. **Generate the boilerplate.** A network generator writes the repetitive router code from a short description, so you change the network, not hundreds of lines.
5. **Use the narrowest permission that works.** `NET_ADMIN` was enough; `--privileged` wasn't needed.
6. **Commit everything the setup needs.** The server, the VPN config and one test file live outside the repo, and they're the parts nobody else can rebuild from it.
7. **Pin what you clone.** A build that follows other projects' default branches is a different build every time.

Three routers, three containers, one shared wire, and a door to the real internet at each end.

## The code

- The Hello Docker README: [tysonthomas9/docker-tutorial](https://github.com/tysonthomas9/docker-tutorial)
- The single-image ns-3 build: [tysonthomas9/ns3-simulator](https://github.com/tysonthomas9/ns3-simulator)
- The three router images, router programs, startup scripts and Compose file: [tysonthomas9/ns3-simulator-nodes](https://github.com/tysonthomas9/ns3-simulator-nodes)

## Credits

The BGP side stands on Nat-Lab's open-source work: [libbgp](https://github.com/Nat-Lab/libbgp), [ns3-bgp](https://github.com/Nat-Lab/ns3-bgp), [ns3-distributed-bridge](https://github.com/Nat-Lab/ns3-distributed-bridge), the bridge-distribute server, and [ns3-bgp-netgen-ng](https://github.com/Nat-Lab/ns3-bgp-netgen-ng), which generated the router programs. They did the heavy lifting. And of course [ns-3](https://www.nsnam.org/) itself.
