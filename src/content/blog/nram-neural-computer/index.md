---
title: 'A computer made of soft switches: rebuilding the Neural Random-Access Machine'
description: 'A neural network that doesn''t compute the answer itself, but wires a tiny computer to do it: fuzzy registers, a memory tape and fourteen gates. Here is how I rebuilt the Neural Random-Access Machine from the paper in TensorFlow eager, what the training logs show, and how far it still is from the paper.'
date: 2019-05-08
tags: [Machine Learning, Neural Networks, TensorFlow]
hero: ./nram-timestep.png
heroAlt: 'A 3D technical drawing on cream grid paper, labelled "Fig. 01 — one timestep of the Neural Random-Access Machine". At the top left, a boxed table titled "A neural network wires a tiny circuit" lists: registers, 3, each a distribution over 0…19; memory, 20 cells, each over 0…19; modules, 14: 12 gates + READ and WRITE; controller, MLP or LSTM; steps, up to 5 per example; after Kurach et al., ICLR 2016. In the drawing, three small shaded cubes labelled r1, r2 and r3 float at the top left, with an arrow labelled P(rᵢ = 0) pointing into a long shaded block labelled CONTROLLER. Dashed lines drop from the controller to a row of fourteen small cubes standing on a thin plate below it: a dark READ cube at the left end, twelve light gate cubes, and a dark WRITE cube at the right end. Below the plate runs a 3D memory tape of 20 cells, numbered 0 at the left and 19 at the right. Lines fan from three neighbouring cells near the left of the tape up to the READ cube, the middle line darkest, and from the WRITE cube down to three neighbouring cells near the right end, showing a soft pointer that mostly picks one cell. Thin callout lines with small mono labels explain each part. Registers: r1, r2, r3, start at 0. Read head: value = pointer · M, a blend of the cells it points at. Controller: sees only P(rᵢ = 0) for each register; picks every wire, pointer and value. Halt, f_t: "am I done?", p_t = f_t · Π over i < t of (1 − f_i). 12 gates: ZERO, ONE, TWO, INC, ADD, SUB, DEC, LT, LE, EQ, MIN, MAX; each input is a soft pick of everything so far. Write head: M ← (J − p)Jᵀ·M + p·aᵀ. Memory tape: 20 cells × 20 values; one READ and one WRITE per step. Footer: up to 5 timesteps per example, after Kurach, Andrychowicz and Sutskever, ICLR 2016, TensorFlow 1.x eager, May 2019; INC and DEC shift the whole distribution, while ADD, SUB, the comparisons, MIN and MAX take the most likely value of each input first.'
draft: true
---

Imagine a computer whose processor is a neural network. Not a network that guesses what a program would print, but one that actually runs a little machine: it picks which register feeds the adder, what gets compared with what, and which memory cell to overwrite. You never write the program. You show the machine a memory before and a memory after, and it has to work out the steps in between.

I've rebuilt that machine from its paper and given it a small sorting job: take a few numbers and drop each one into the right bucket in memory. This post covers how the machine works, why it's an interesting idea, how I put it together, what the training logs show, and how far my version still is from the paper.

*Part 2 of 2 in a short series on neural algorithms. [Part 1](/blog/pointer-networks/) is about Pointer Networks.*

## A computer made of soft switches

The design isn't mine. It's the **Neural Random-Access Machine** (NRAM), from Karol Kurach, Marcin Andrychowicz and Ilya Sutskever ([ICLR 2016](https://arxiv.org/abs/1511.06392)). This project isn't new research: it's my own re-implementation of their paper, trained on bucket-sort tasks I designed instead of the paper's tasks.

Picture a very small computer:

- **Registers.** A handful of scratch slots. I used three. Each holds a number from 0 to 19.
- **A memory tape.** Twenty cells, each also holding a number from 0 to 19.
- **Gates.** A fixed toolbox: the constants 0, 1 and 2, increment, decrement, add, subtract, less-than, less-or-equal, equals, min and max, plus READ and WRITE for memory. Fourteen modules in all.

On top sits the **controller**, a neural network. At every step it wires the toolbox into a small circuit: register 2 into the adder, the adder's output into the comparator, this value into that memory cell. It also says how sure it is that the job is done.

The clever part is that nothing is ever exactly one number. Each register and each memory cell holds a *probability distribution* over 0…19, like "70% a 3, 30% a 4". Every wire is a soft switch too: "mostly register 1, a little of the adder's output". Gates take fuzzy inputs and give fuzzy outputs. Because nothing is a hard choice, the whole machine is differentiable, and plain gradient descent can train the controller.

## Why it's interesting

Most neural networks learn a function: pixels in, label out. The NRAM is asked to learn a *procedure*. The answer has to come from a sequence of small, ordinary operations (read a cell, compare two numbers, write a cell), and the network's only job is to choose which operations to run and how to connect them.

That changes what the network has to be good at. It doesn't need to hold the numbers or do the arithmetic itself; the gates do that. It needs to learn the wiring. And because memory is addressed by pointers, the same wiring can in principle work on longer inputs than the ones it was trained on, which is the kind of generalisation an ordinary network struggles with. In the paper, the machine learns tasks such as copying, reversing and merging lists this way.

## Building it one gate at a time

I built the machine bottom-up in TensorFlow 1.x with eager execution, in Colab notebooks, testing each piece before moving on.

**The gates.** Increment and decrement shift the whole distribution along by one place, so "70% a 3, 30% a 4" becomes "70% a 4, 30% a 5". Add, subtract, the three comparisons, min and max work differently: they take the most likely value of each input, compute the answer and turn it back into a certainty. The constants always output a sure 0, 1 or 2.

**The wiring.** Every gate's input is a weighted mix of everything computed so far: the registers first, then each gate's output as it's produced. So the twelve gates form a chain, and a later gate can build on an earlier one's answer.

**Hand-wired circuits.** Before any training, I wired circuits by hand to check the plumbing. In one, the machine increments r1, decrements the result, adds that to r1 and shuffles the registers: [2, 1, 3] goes in and [3, 2, 2] comes out. Another adds r0 and r1 into r0 for two different inputs.

**Memory.** READ takes a soft pointer, a distribution over the 20 cells, and returns a blend of the cells it points at. WRITE uses the paper's formula, `M ← (J − p)Jᵀ·M + p·aᵀ`. Each cell is erased in proportion to how much the pointer points at it, and the new value is written in by the same amount. Both got their own small tests too.

Put together, one step goes like this. The controller looks at the registers. Following the paper, it sees only one number per register: the chance that it holds 0. It then picks the READ pointer, the inputs for every gate, where and what to WRITE, and what each register should hold next. Each new register value is a soft pick from 17 candidates: the 3 registers, READ, the 12 gates and the WRITE pointer. The machine gets up to five steps per example.

## Knowing when to stop

A program has to finish, and the NRAM learns when. At each step *t*, the controller outputs *f<sub>t</sub>*, its confidence that the work is done. The chance that the machine stops at exactly step *t* is

*p<sub>t</sub> = f<sub>t</sub> · (1 − f<sub>0</sub>) · (1 − f<sub>1</sub>) · … · (1 − f<sub>t−1</sub>)*

In words, "done now, and not done at any earlier step". The loss looks at the memory after every step and weights its error by *p<sub>t</sub>*. If the machine is confident it finished at step 2, the memory at step 2 is what gets judged.

There's one more rule. At the final allowed step, the paper hands over whatever probability is left, *p<sub>T</sub> = 1 − Σ p<sub>i</sub>*, so the chances always add up to 1. Think of it as a valve that closes the funnel: whatever happens, the machine has to hand in an answer somewhere.

## Teaching it to sort into buckets

Rather than use the paper's tasks, I made my own: a family of "bucket sort" problems. A small bucket-sort helper from GeeksforGeeks split the numbers 1–19 into three buckets: 1–6, 7–13 and 14–19.

The main version, which I called Dataset 5, lays the memory out like this:

- Cells 0–2 hold pointers to the three buckets: cells 9, 12 and 15.
- Cells 4–6 hold three numbers, one from each bucket, in random order. Cell 7 holds a fourth number from a random bucket.
- The target is the same memory, plus each number copied into its bucket's cell. The fourth number goes one cell further on.

Everything else is empty, and empty cells in the target don't count towards the loss. Each run generated 500 examples. The first 40, shuffled and repeated 20 times, made 800 training steps per epoch, one example per step. The other 460 were held out for testing.

It wasn't the first task. The notebook's status list ticks off Datasets 1–3 (a NOT gate, read/write and copy) as done earlier. Dataset 4 is a smaller version with three numbers, and Dataset 6 has six numbers and served as the larger test.

## Three brains for the machine

I tried three controllers:

- **An MLP.** Two dense ReLU layers (100 or 400 units), then one softmax for each decision and a sigmoid for "done". The paper's feed-forward controller is also an MLP with two hidden layers.
- **LSTM V1.** A 256-unit LSTM, followed by the same softmax heads.
- **LSTM V2.** The same LSTM, but every output head is its own small LSTM followed by a softmax.

All three trained with Adam (learning rate 0.001, plus one MLP run at 0.01) for up to two epochs, with up to five timesteps per example. Training stopped early once the loss on an example dropped below 10⁻⁵.

## What training looked like

Here's what the main notebook logged on Dataset 5:

| Controller | Steps until it stopped | First → last loss |
|---|---|---|
| LSTM V1 | 1,600 (no early stop) | 184.66 → 2.1 × 10⁻⁴ |
| LSTM V2 | 13 | 184.42 → 3.4 × 10⁻⁶ |
| MLP, 400 units | 27 | 183.08 → 8.6 × 10⁻⁶ |
| MLP, 100 units | 157 | 204.03 → 8.9 × 10⁻⁶ |
| MLP, 400 units, learning rate 0.01 | 12 | 177.60 → 8.5 × 10⁻⁶ |

In the notebook I noted that "Higher the dimensions in MLP Controller faster it converges", and that "It takes longer for LSTM model to converge than compared to MLP. Also LSTM V2 converges faster than V1 because of higher trainable parameters." The held-out test losses for the 400-unit MLP sat around 10⁻⁶ to 10⁻⁵. A second notebook ran the same models on Dataset 4 and tested them on the larger Dataset 6. A third added Gaussian noise (standard deviation 0.2) to the controller's inputs as an ablation.

The loss is only a proxy for the job, though. To see what the machine actually does, you have to decode the memory it leaves behind: the most likely value in each cell. The notebook's debug cell does that for one held-out example, after the LSTM V2 controller has run on it:

![A 3D technical drawing titled "Drop each number into its bucket", subtitled "Cells 0–2 point at the buckets. Cells 4–7 hold the numbers. The machine must copy each number to its bucket." Three memory tapes are drawn as rows of 20 shaded 3D cells, numbered 0 to 19 along the top, with each value printed on the front of its cell. Input: cells 0 to 2 hold 9, 12 and 15 (the bucket pointers); cells 4 to 7 hold 2, 11, 16 and 13 (the numbers to sort); every other cell is empty and drawn as a dotted outline. Target: the same, plus 2 in cell 9 (bucket A), 11 in cell 12 and 13 in cell 13 (bucket B), and 16 in cell 15 (bucket C). Decoded: 9, 1, 15, 1, 2, 11, 16, 13, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1. Five cells are solid black as wrong: cell 1 (1 instead of 12), cell 9 (0 instead of 2), cell 12 (1 instead of 11), cell 13 (1 instead of 13) and cell 15 (1 instead of 16). Brackets under the decoded tape mark the bucket pointers, the numbers to sort, and buckets A at 9, B at 12 and C at 15. Side notes give the bucket ranges 1–6, 7–13 and 14–19, say that the fourth number goes one cell on, and give the loss as 6.2 × 10⁻⁷. A footnote says dotted cells are empty (all zeros), empty target cells add nothing to the loss, decoded means the most likely value of each cell after 5 steps from the notebook's debug cell (LSTM V2 controller, held-out example), and both the near-zero loss and the wrong answer are in the notebook's saved output.](./memory-tape.png)

The loss on that example is 6.2 × 10⁻⁷, but the memory doesn't match the target. None of the numbers reached its bucket, and one of the bucket pointers got overwritten. So a low loss here doesn't yet mean the machine sorts, and the notebooks don't measure anything beyond the loss to say otherwise.

## How far this is from the paper

The machine itself follows the paper closely. The training around it is much simpler.

| | The paper | My notebooks |
|---|---|---|
| **Tasks** | Its own set, such as copying, reversing and merging lists | Bucket-sort tasks I designed |
| **Gates** | Every gate works on whole distributions | Increment, decrement, READ and WRITE do; the rest take the most likely value first |
| **Controller** | Feed-forward or LSTM, seeing P(rᵢ = 0) | MLP or LSTM, seeing P(rᵢ = 0) |
| **Training** | Curriculum, gradient clipping, gradient noise, entropy bonus | Adam, one example per step, none of those |

## What's still rough

**The training tricks from the paper.** The notebook's to-do list names what's missing: gradient clipping, gradient noise, an entropy bonus, limiting the log, and enforcing the distribution constraints. None of them are in yet. There's no curriculum either, and the paper relies on one.

**Most gates aren't fuzzy.** Add, subtract, the comparisons, min and max take the most likely value of each input first. That keeps them simple, but no gradient flows back through those inputs, and a 50/50 input becomes a single answer.

**Two loose ends I've flagged myself.** The same list says "LSTM – check hidden states" and "Check Final Error Summation".

**Results aren't checked beyond the training run.** The notebooks track the loss and nothing else. Apart from the one decoded example above, there's no count of how many cells come out right, on training or test data.

## What I'd tell someone starting out

1. **Measure the thing you care about.** Decode the memory and count the correct cells, and log that next to the loss from the first run.
2. **Be suspicious of a loss that falls fast.** Thirteen steps to 10⁻⁶ on a memory task is a reason to look closer before celebrating.
3. **Build bottom-up and test each piece.** Hand-wired circuits and small read and write tests catch plumbing mistakes before training hides them.
4. **Test the invariants.** The stopping chances sum to 1, every register and memory row sums to 1. Each check is a few lines of code.
5. **Reproduce before you extend.** A paper's own task gives you a known-good result to compare against. A new task gives you only your own loss.

Earlier in the series: [Pointer Networks](/blog/pointer-networks/), a network whose output is a position in its own input.

## The code

The code is on GitHub at [tysonthomas9/NPL_Project](https://github.com/tysonthomas9/NPL_Project). The main notebook is `NRAM_Controller_10_Final_Dataset5`, written for Google Colab; it needs TensorFlow 1.x and NumPy.

## Credits

The machine is Kurach, Andrychowicz and Sutskever's: "[Neural Random-Access Machines](https://arxiv.org/abs/1511.06392)", ICLR 2016. The gate set, the fuzzy read and write, the halting rule and the controller's view of the registers all come from their paper. The bucket-sort helper comes from [GeeksforGeeks](https://www.geeksforgeeks.org/bucket-sort-2/).
