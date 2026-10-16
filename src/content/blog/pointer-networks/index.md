---
title: 'Pointing instead of predicting: a 12-token Pointer Network'
description: 'Some questions are answered with one of the things you were just given: which points form the outline, which city comes next. A pointer network answers by pointing. Here is a tiny one I rebuilt from the paper, small enough to check every number by eye.'
date: 2019-03-19
tags: [Machine Learning, Neural Networks, TensorFlow]
hero: ./pointer-vs-vocabulary.png
heroAlt: 'A technical drawing on cream grid paper titled "Point at the input instead of naming a class", with the subtitle "A pointer network reuses the attention scores as its output: one choice per input position, however many there are." Two framed panels. Left panel, "Seq2seq · softmax over a fixed vocabulary": a flat "decoder state dᵢ" box (after reading the input and the last output) feeds a flat "Dense + softmax" box (one score per vocabulary entry). A line runs down from it to a row of twelve small shaded cubes, each with a light top face, a hatched right side and a label on the front: a, b, c, d, …, x, y, z, 0, …, 8, =>. A note under the cubes says the output size is fixed when you build the model, which is fine for words but awkward when the answer is "which of the points I just gave you?", such as a convex hull, a tour of cities or a sorted order. Right panel, "Pointer network · softmax over the input positions": a row of twelve shaded cubes numbered 0 to 11 as input position j, labelled =>, t, y, s, o, n, t, h, o, m, a, s. Cube 2 (y) has a black front face. An arrow runs down from each cube to a flat box for its encoder state, e₀ to e₁₁. Lines from all twelve states join and lead, together with a small decoder box dᵢ, into a wide box reading "uⱼ = vᵀ tanh(W₁·eⱼ + W₂·dᵢ)" and "p(Cᵢ = j) = softmax(u)ⱼ · the distribution over positions is the output". A thick line labelled "points at j = 2" leaves that box, runs up the right side and across the top, and comes down onto the top of the y cube. A note says the chosen input (here y) is fed back as the decoder''s next input: twelve inputs give twelve possible answers, a hundred inputs a hundred. Footer: after Vinyals, Fortunato and Jaitly, "Pointer Networks", 2015, section 2.3; example input from my toy notebook, March 2019.'
draft: true
---

*Part 1 of 2 in a short series on neural algorithms. [Part 2](/blog/nram-neural-computer/), on the Neural Random-Access Machine, is next.*

Hand someone a scatter of dots and ask them to trace the outline. They won't invent new dots. They'll point: this one, then that one, then that one, back to the start. Ask them for the shortest route through a list of cities, or to put a list of numbers in order, and it's the same: the answer is made of things you already gave them.

Most neural networks can't answer like that. They answer by picking from a fixed menu decided when the network was built, and a menu can't hold "the third dot you just showed me" when every question has different dots. A **pointer network** gets around this by answering the way a person would: it points at one of its inputs.

I've rebuilt that idea from the paper, on a problem tiny enough that I could check every number by eye. This post covers the problem pointer networks solve, the one small change that makes them work, the toy I built, and what it showed.

## When the answer is one of your inputs

The usual recipe for turning one sequence into another, a "sequence-to-sequence" model, reads the input with one network and writes the output with a second one, a step at a time. At each step the writer ends with a **softmax** over its vocabulary: a score for every word it knows, turned into probabilities that add up to 1. The most likely word is the output.

That's perfect for translation, where the vocabulary is the same for every sentence. It breaks when the answer is a position. If the question is "which of these 12 points form the outline?", there are 12 possible answers. Next time there are 50. You can't build a fixed menu for that.

The paper behind the idea, *Pointer Networks* by Oriol Vinyals, Meire Fortunato and Navdeep Jaitly ([2015](https://arxiv.org/abs/1506.03134)), tested it on exactly these kinds of problems: convex hulls (the outline of a set of points), Delaunay triangulation and the travelling salesman problem. I didn't attempt any of those. I wanted to see the core mechanism working first, on something far smaller.

## Attention, turned into the answer

By 2015, most sequence-to-sequence models already had **attention**. At each step, the writer looks back over everything the reader saw, gives each input a relevance score, and turns the scores into a softmax. It then blends the inputs according to those weights and uses the blend to help choose the next word. It's like glancing back at the source sentence while you translate.

The pointer network's trick is to stop there. The softmax over input positions isn't a step towards the answer; it *is* the answer. Whichever input gets the highest weight is the one the network points at. Twelve inputs, twelve possible answers. A hundred inputs, a hundred.

![A technical drawing on cream grid paper titled "Point at the input instead of naming a class", with the subtitle "A pointer network reuses the attention scores as its output: one choice per input position, however many there are." Two framed panels. Left panel, "Seq2seq · softmax over a fixed vocabulary": a flat "decoder state dᵢ" box (after reading the input and the last output) feeds a flat "Dense + softmax" box (one score per vocabulary entry). A line runs down from it to a row of twelve small shaded cubes, each with a light top face, a hatched right side and a label on the front: a, b, c, d, …, x, y, z, 0, …, 8, =>. A note under the cubes says the output size is fixed when you build the model, which is fine for words but awkward when the answer is "which of the points I just gave you?", such as a convex hull, a tour of cities or a sorted order. Right panel, "Pointer network · softmax over the input positions": a row of twelve shaded cubes numbered 0 to 11 as input position j, labelled =>, t, y, s, o, n, t, h, o, m, a, s. Cube 2 (y) has a black front face. An arrow runs down from each cube to a flat box for its encoder state, e₀ to e₁₁. Lines from all twelve states join and lead, together with a small decoder box dᵢ, into a wide box reading "uⱼ = vᵀ tanh(W₁·eⱼ + W₂·dᵢ)" and "p(Cᵢ = j) = softmax(u)ⱼ · the distribution over positions is the output". A thick line labelled "points at j = 2" leaves that box, runs up the right side and across the top, and comes down onto the top of the y cube. A note says the chosen input (here y) is fed back as the decoder's next input: twelve inputs give twelve possible answers, a hundred inputs a hundred. Footer: after Vinyals, Fortunato and Jaitly, "Pointer Networks", 2015, section 2.3; example input from my toy notebook, March 2019.](./pointer-vs-vocabulary.png)

*Left: the usual ending, a fixed menu. Right: the pointer network scores each input and points at one, and the input it picks becomes the writer's next input.*

In the paper's notation, for the writer's current state *d<sub>i</sub>* and the reader's view of each input *e<sub>j</sub>*, the score is *u<sub>j</sub> = vᵀ tanh(W<sub>1</sub> e<sub>j</sub> + W<sub>2</sub> d<sub>i</sub>)*, and the output is the softmax of those scores. In TensorFlow that's only a handful of lines, and it's the one piece of code worth showing:

```python
# one vector per input
w1_e = self.W1(encoder_outputs)
# the writer's current state
w2_d = self.W2(dec_output)
# one score per input
scores = self.V(
    tf.nn.tanh(w1_e + w2_d)
)
# probabilities over input positions
# are the output
return tf.nn.softmax(
    scores, axis=1
)
```

Ordinary attention would carry on and build a blended "context vector" from these weights. Here there's no context vector and no vocabulary. The weights go straight out.

## A problem small enough to check by eye

The task I set it is tiny: one fixed sequence of 12 tokens,

`=> t y s o n t h o m a s`

and the answer is to copy it starting from the third token (position 2), then point at `=>` to say "done":

`y s o n t h o m a s => =>`

The `=>` token does two jobs. It's the first thing the writer is fed, and pointing back at it means "stop". (The paper uses separate start and end symbols.)

![A technical drawing titled "Copy from position 2, then point at the stop sign", subtitled "One fixed 12-token sequence. The answer at every step is a position in the input, not a character." On the left, an Input row of twelve cells numbered 0 to 11: =>, t, y, s, o, n, t, h, o, m, a, s. A note says each token is a hand-written 64-bit 0/1 code (36 tokens: a to z, 0 to 8, =>) and there are no learned embeddings. Below it, a Target row, one input position per output step, numbered as steps 0 to 11: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, then 0 and 0 filled black. Under each is the token it points to: y, s, o, n, t, h, o, m, a, s, =>, =>. A note reads: read out "y s o n t h o m a s => =>"; => at position 0 is both the decoder's first input and the stop target; the first t (position 1) is skipped. On the right, the same target drawn as a 12 by 12 one-hot matrix, rows for output step i and columns for input position j: black cells form a diagonal shifted right by 2 (row 0 at column 2 down to row 9 at column 11), then rows 10 and 11 are black in column 0. Footer: training set of 600 copies of this one example, shuffle(100), batches of 32, 10 epochs (190 updates), no held-out set, notebook March 2019.](./toy-task.png)

*The answer is a list of positions, not letters. Drawn as a grid, it's a diagonal shifted two places to the right, plus two cells in the `=>` column. Keep that shape in mind; it comes back later.*

Each token goes in as a fixed pattern of 64 ones and zeros, from a small hand-written table of 36 tokens (the letters, the digits 0 to 8, and `=>`). Nothing about the tokens is learned. The training set is that single example, copied 600 times. That makes this a test of whether the machinery works at all, not of whether it can generalise, and I'll come back to that.

## Keeping everything else small

Around the pointer, the network is as plain as it gets. A reader (an LSTM with 256 units) goes through the 12 tokens and keeps a summary of each one; those summaries are what the pointer chooses between. A writer (a second LSTM of the same size) starts from where the reader finished and is fed `=>` as its first input. At every step, the pointer scores the 12 inputs against the writer's state.

While training, the writer gets a helping hand called **teacher forcing**: whatever it points at, its next input is the token it *should* have pointed at. It's like a tutor correcting each word as you read aloud, so one early mistake doesn't derail the rest of the sentence. The score it's judged on is how much probability it put on the right position, added up over the 12 steps. Training ran for 10 passes over the data in batches of 32, which is 190 updates in all, using the Adam optimiser with its default settings.

The code follows the same pattern as TensorFlow's 2018 eager-execution tutorial, [*nmt_with_attention*](https://github.com/tensorflow/tensorflow/blob/v1.13.1/tensorflow/contrib/eager/python/examples/nmt_with_attention/nmt_with_attention.ipynb): a small Keras model for each part and a hand-written training loop.

## Watching it point

After training, the tutor goes away. The writer feeds itself: at each step it takes the position with the highest probability and passes that token back in as its next input. Here's the very first step, with the numbers the notebook printed.

![A technical drawing titled "Step 0: the pointer lands on 'y'", subtitled "Values printed by the notebook's inference cell. Every step repeats this loop; there are 12 steps." On the left, an Encoder box (LSTM 256: reads all 12 input codes, returns e₀ to e₁₁ as 12 × 256, and its final h, c) passes "final h, c" down to a Decoder box (LSTM 256: starts from the encoder's h, c; first input is the code of =>; one step gives d₀, 1 × 256). Arrows labelled eⱼ and d₀ go to a central box, "Pointer (attention as output)": W₁·eⱼ for all 12 positions and W₂·d₀; add, tanh, V (256 to 1); softmax over the 12 positions; no context vector, no vocabulary. An arrow leads to a bar chart titled "p(position j) at step 0" over twelve cells: =>, t, y, s, o, n, t, h, o, m, a, s, numbered 0 to 11. There is a tall black bar of 0.870 on position 2 (y, filled black), a small grey bar of 0.062 on position 3 (s) and a small grey bar of 0.027 on position 0 (=>). A note says the other nine positions share the remaining 0.04 or so. A thick line runs from the y cell back to the decoder, labelled "argmax = 2: the code of y is the next decoder input". A dashed box below, "While training", says the next input is the code at the target position instead (teacher forcing). Footer: greedy decoding, fixed 12 steps, no early stop at =>; full readout y s o n t h o m a s => =>; TensorFlow 1.x eager, March 2019.](./decoding-step.png)

*Step 0 puts 0.870 on `y`, the right answer. Most of what's left sits on its neighbour.*

Before training, the same loop produced `a m m m m m m m m m m m`. After training it produced `y s o n t h o m a s => =>`, an exact match for the target. At each step the top choice got between 0.70 and 0.87 of the probability for the ten letters, and 0.92 and 0.93 for the two `=>` steps, with most of the rest on the neighbouring positions.

| | Before training | After training |
|---|---|---|
| **Output** | `a m m m m m m m m m m m` | `y s o n t h o m a s => =>` |
| **Matches the target** | No | Yes, every step |
| **Top probability per step** | n/a | 0.70 to 0.87 on letters, 0.92 to 0.93 on `=>` |

This is the sequence it was trained on, though. The notebook has no separate test set, so all this shows is that it can fit this one example.

## From stripes to a diagonal

The training loss fell quickly. The last value the notebook printed was **0.0697**.

![A line chart from the notebook with a light grey seaborn background. The x-axis is "batches", from 0 to about 190; the y-axis is "loss value", from about 0.1 to 0.9. The curve starts near 0.93, stays flat for a few batches, drops steeply between roughly batch 10 and batch 30 to about 0.4, then flattens out and declines slowly to about 0.1 by the last batch.](./loss-curve.png)

*Loss per batch over all 190 updates, as the notebook recorded it. Almost all of the drop happens in the first 30 batches.*

The curve and that printed number are measured slightly differently (the curve is a scaled total over all 12 steps of a batch, the printout is the last step of the last batch), so they don't line up exactly.

The more interesting picture is the notebook's snapshots of the full 12 × 12 grid of probabilities, one row per output step and one column per input position. It saved one at batches 0 and 10 of every epoch and plotted 19 of them. Here they are redrawn as layers along the training-time axis.

![A technical drawing on cream grid paper titled "From stripes to a diagonal", subtitled "The notebook's 19 snapshots of the 12 × 12 grid of probabilities, stacked in training order." Nineteen thin square slabs stand upright in a row, drawn in 3D with a hatched top edge and a beige side edge. They recede from the upper left to the lower right along a "training time" axis marked in updates applied: 0, 19, 38, 57, 76, 95, 114, 133, 152 and 171, with a tick under every slab. Each slab's front face is a 12 × 12 grid of cells: rows are output steps 0 to 11 and columns are input positions 0 to 11, and darker cells mean higher probability. Each slab partly hides the right-hand columns of the one before it, and the last slab is fully visible. A callout on the first slab, "Before any update", says it shows the same stripes in every row: vertical bands that are darkest in the right-hand columns. A callout on the third slab, "After 19 updates", says a diagonal two places to the right appears and column 0 darkens for the last steps. Across the following slabs the diagonal gets narrower and darker. A callout on the last slab, "After 171 updates", says it shows the shifted diagonal plus column 0 at steps 10 and 11: dark cells run from row 0, column 2 down to row 9, column 11, with two dark cells in column 0 at the bottom. A side note repeats that each layer's rows are output steps 0 to 11 and its columns input positions 0 to 11. Footer: redrawn from the notebook's plot; darker means higher probability and, as in the original, each layer is shaded on its own scale. Snapshots were taken at batches 0 and 10 of each epoch (19 batches per epoch); the 20th, at epoch 10 batch 10, isn't in the plot. March 2019.](./attention-snapshots.png)

*Follow the layers from front to back. The grid starts as vertical stripes, the same guess at every step, and within a few snapshots becomes the shifted diagonal from the toy-task figure.*

At first, every step gets roughly the same distribution, whatever step it is. Then a diagonal two places to the right appears, along with the `=>` column for the last two steps, and the remaining panels sharpen it. By the end, the network's output grid is the target grid.

## How far this is from the paper

The core mechanism is the paper's, nearly line for line. Everything around it is as small as I could make it.

| | The paper | My notebook |
|---|---|---|
| **Task** | Convex hull, Delaunay triangulation, travelling salesman | One fixed character sequence: copy from position 2, then stop |
| **Training data** | 1M generated examples | 600 copies of one example |
| **Inputs** | Point coordinates, varying in number | 12 hand-made 64-bit codes |
| **Network** | One LSTM layer, 256 or 512 units | One LSTM layer, 256 units |
| **Training** | SGD, learning rate 1.0, batch 128, gradient clipping | Adam with defaults, batch 32, no clipping |
| **Start and end** | Separate symbols | `=>` does both |
| **Picking answers** | Beam search | Take the top choice, for a fixed 12 steps |
| **The pointer** | Softmax over vᵀ tanh(W<sub>1</sub>e<sub>j</sub> + W<sub>2</sub>d<sub>i</sub>) | The same |

## What's still rough

**One example.** The network only ever saw one sequence, 600 times over. It can fit it perfectly, but nothing here says it would point correctly at a sequence it hasn't seen.

**No test set.** The only check is decoding the training sequence. There's no held-out data and no accuracy measured on anything else.

**Fixed length.** Every input is exactly 12 tokens, so the thing that makes pointer networks special, an output that grows with the input, is never exercised.

**It doesn't stop.** Decoding always runs 12 steps, even after it points at `=>`. In this toy that happens to line up with the end of the target.

**Leftovers.** The token table has no `9`, and a few comments in the notebook still describe an older 9-token version of the sequence.

## What's next

The data comes first. Next I want a fresh random sequence for every example, with lengths that vary, and a held-out set to test on from the first run. Then a task with a known answer, like sorting numbers, before one of the paper's own tasks, such as convex hull, so there's a published result to compare against. Along the way: separate start and end tokens, stopping at the end token, beam search when picking answers, and an exact-match score logged next to the loss.

## What I'd tell someone starting out

1. **Start with a problem you can check by eye.** Twelve tokens and a 12 × 12 grid made it possible to see exactly what the network was doing at every step.
2. **Print the whole distribution, not just the answer.** The snapshots going from stripes to a diagonal said more than the loss curve did.
3. **Then make the data random.** One example proves the plumbing works. It doesn't prove the model can generalise.
4. **Hold out a test set from day one.** "It matches the training sequence" is the start of the story, not the result.
5. **Exercise the feature that makes the model special.** For a pointer network that means inputs of different lengths.

When the answer is one of your inputs, let the network point at it.

## The code

It's one Colab notebook, MIT-licensed, in [tysonthomas9/pointer-networks](https://github.com/tysonthomas9/pointer-networks). It needs TensorFlow 1.x (eager mode), NumPy and Matplotlib. No versions are pinned.

## Credits

The idea, the scoring formula and the problems it was built for are from Oriol Vinyals, Meire Fortunato and Navdeep Jaitly's [*Pointer Networks*](https://arxiv.org/abs/1506.03134) (2015). The code's structure follows the pattern of TensorFlow's [*nmt_with_attention*](https://github.com/tensorflow/tensorflow/blob/v1.13.1/tensorflow/contrib/eager/python/examples/nmt_with_attention/nmt_with_attention.ipynb) tutorial.
