---
title: 'Spotting duplicate questions with a Siamese neural network'
description: 'Two questions can share most of their words and still ask different things. We trained twin neural networks to read Quora question pairs, combined two of them with a small second model, and got to 75% accuracy on pairs it had never seen. Here is how, and what fought back.'
date: 2019-01-07
tags: [Machine Learning, NLP, Siamese Networks]
hero: ./twin-encoder.png
heroAlt: 'A technical drawing on cream grid paper titled "Two questions, one network", labelled FIG. 01, a Siamese network. Two identical towers of four shaded isometric blocks stand side by side. Question 1, "How can I increase the speed of my internet co…", feeds the left tower and Question 2, "How can Internet speed be increased by hacking…", feeds the right. Callouts name the blocks from the bottom up: Embedding, GloVe word vectors kept fixed; Convolution ×2, short phrases, 100 steps down to 5; LSTM ×3, reads the 5 steps in order; Summary, 2,048 numbers per question. Dashed lines join each block to its twin, and a callout says shared weights: both towers are one network, so both questions are read the same way. Arrows from the top of both towers meet in a larger block marked |a − b|, labelled compare, the gap number by number, 2,048 gaps. An arrow leads from it to a small block labelled p(duplicate): two layers weigh the gaps, then a last one outputs a probability from 0 to 1. A title block lists the task, same question or not; the data, Quora Question Pairs; the weights, 7,979,585 in total; and training with binary cross-entropy, Adam, 5 passes.'
draft: true
---

Ask a question on a Q&A site and there's a good chance someone has asked it before, in different words. If the site can spot that, the existing answers can show up straight away. That's the job here: read two questions and say whether they ask the same thing.

Shared words don't settle it. Take two questions from the first rows of the Quora data: "How can I increase the speed of my internet co…" and "How can Internet speed be increased by hacking…" (that's as far as our notebook prints them). They share most of their words, and the data labels them as *different* questions. Meanwhile, two questions that mean the same thing can be worded completely differently.

We ended up with a pair of twin neural networks and a small model on top that combines them. On 40,000 question pairs none of the models had seen, it was right 75.24% of the time. A model that always says "different" would get 63.29%.

This post is about how we got there: the word-counting baseline that fell short, the twin networks that learn what a question means, the two kinds of word meaning we tried, and how combining them got us the last few points.

## Same words, different questions

The data is Kaggle's [Quora Question Pairs](https://www.kaggle.com/c/quora-question-pairs/data). Each row is two questions and a yes-or-no label saying whether they ask the same thing. There are 404,290 labelled pairs, and about 37% of them are duplicates.

That 37% matters more than it looks. A model that always answers "not a duplicate" is right most of the time. On the 40,000 pairs we held back for testing, that lazy answer scores 63.29%. So the bar to beat isn't a coin flip at 50%; it's 63.29%.

## First try: counting shared words

Before building anything clever, we tried the obvious thing. Turn each question into a list of word weights (TF-IDF, which gives rare words more weight than common ones), measure how much the two lists overlap, and call the pair a duplicate if the overlap is 0.5 or more.

It got 66.82% across all 404,290 pairs. That's only a little above the lazy answer, and it wasn't measured on the same 40,000 test pairs as everything below, so it's a sanity check rather than a fair race. Counting shared words doesn't get you far when the words are the problem.

## Two readers with one brain

The idea we settled on is a **Siamese network**. Picture one reader who reads both questions, one after the other, and writes a short summary of each in the same private shorthand. Then you compare the two summaries. If they're close, the questions probably ask the same thing.

The important part is that it's the *same* reader. In network terms, two copies of one network share a single set of weights. Both questions get summarised in exactly the same way, so "close" means the same thing for both, and swapping the questions gives the same answer.

That suits duplicate detection well:

- **It's fair to both sides.** "Is A a duplicate of B?" has the same answer as "Is B a duplicate of A?", and the design builds that in.
- **It learns meaning, not overlap.** The reader is trained on the labels, so it can learn that two differently worded questions mean the same thing.
- **The reader is reusable.** Once trained, you can summarise every question once and compare summaries, instead of rereading every possible pair.

## Building the twin

We built it in Keras on TensorFlow, in Google Colab on a GPU. The drawing at the top of this post shows the whole network.

First, each question was cleaned: anything that wasn't a letter became a space, common filler words from a stop-word list were dropped, and everything was lowercased. We kept the 20,000 most common words, turned each word into a number, and padded or cut every question to 100 numbers.

Each number then becomes a list of 100 values that captures the word's meaning, taken from Stanford's [GloVe](https://nlp.stanford.edu/projects/glove/) word vectors. We kept those fixed rather than retraining them.

The reader itself has three layers of work. Two convolution layers scan for short phrases and shrink each question from 100 steps to 5, which keeps the next part cheap. Three LSTM layers, which read in order and remember what came before, then read those 5 steps. A final layer turns the result into a summary of 2,048 numbers.

To compare two summaries, the network takes the gap between them, number by number. That isn't one distance but 2,048 small ones, saying how far apart the questions are in each respect. Two more layers learn which of those gaps matter, and the last one outputs a probability that the pair is a duplicate.

The whole thing has 7,979,585 weights, of which 5,979,585 were trained. It learned with binary cross-entropy loss and the Adam optimiser at a learning rate of 0.0001, in batches of 128, for 5 passes over the training pairs. Each pass took a little under five minutes.

## Two kinds of word meaning

GloVe learned what words mean from general text. We also trained a second version of the same network on Word2Vec vectors learned from the Quora questions themselves.

<aside class="pull">In the Quora-trained word vectors, the closest words to "cat" were gate, gre, gmat and other exam names. On Quora, CAT is an exam.</aside>

That side-trip produced the most surprising result in the notebook. Ask the Quora-trained vectors for the words closest to "cat" and you get gate, gre, gmat, clat, neet, xat, bitsat, upsc, jee and toefl. On Quora, "CAT" comes up far more often as a competitive exam than as a pet. Where your words come from changes what they mean.

It didn't make the network better, though:

| | GloVe | Word2Vec |
|---|---|---|
| **Learned from** | General text (Stanford's glove.6B) | The Quora questions |
| **Words it knows** | 400,000 | 31,237 |
| **Accuracy on the 40,000 test pairs** | 68.75% | 68.20% |

## Two opinions are better than one

Neither network was great on its own: both were only about five points above the lazy answer. So we tried letting them vote.

Each network scored every pair, giving each pair two numbers. A small second model then learned how to turn those two numbers into a final answer.

![A technical drawing titled "From a question pair to a label". Seven numbered steps. 1, Quora Question Pairs: 404,290 labelled pairs, 36.9% duplicates. 2, Clean: letters only, TweetTokenizer, drop stop words, lowercase. 3, Index: Keras Tokenizer, top 20,000 words, pad each to 100 ids. 4, Split: shuffle, first 40,000 are the hold-out, 364,290 to train with 20% held back for validation. 5, two Siamese networks: GloVe (glove.6B.100d, frozen, 5 epochs), tagged 68.75%, and Word2Vec (vectors trained on the Quora questions, 5 epochs), tagged 68.20%. 6, two scores per pair, p_glove and p_w2v, for every train and test pair. 7, two second classifiers: a Random Forest with 100 trees fit on all 364,290 score pairs, tagged 74.54%, and an SVM with an RBF kernel fit on the first 50,000 score pairs, tagged 75.24%. Both lead to a final box: duplicate, 0 or 1 for each pair. A footnote says the percentages are accuracy on the same 40,000-pair hold-out, and that always answering not duplicate would score 63.29%.](./pipeline.png)

Follow the numbered steps: the two networks only produce scores, and the decision is made by the second model in step 7.

We tried two second models:

| | Random Forest | SVM |
|---|---|---|
| **What it is** | 100 decision trees that vote | One curved boundary between yes and no |
| **Trained on** | All 364,290 training pairs' scores | The first 50,000 pairs' scores |
| **Accuracy on the 40,000 test pairs** | 74.54% | 75.24% |

The Random Forest leaned on the two networks almost equally (0.505 and 0.495), so both were pulling their weight.

## What the numbers say

All of these come from the notebook's own output, on the same 40,000 pairs that no model saw during training:

| Model | Accuracy |
|---|---|
| Always "not a duplicate" | 63.29% |
| Siamese network, Word2Vec | 68.20% |
| Siamese network, GloVe | 68.75% |
| Both networks → Random Forest | 74.54% |
| Both networks → SVM | 75.24% |

![A technical drawing titled "The stack beat either network alone", with two charts. On the left, a dot plot of accuracy on the 40,000-pair hold-out, with the axis starting at 60%: always not duplicate 63.29% (open dot, the floor), Siamese Word2Vec 68.20%, Siamese GloVe 68.75%, Stack to Random Forest 74.54%, Stack to SVM (RBF) 75.24%. On the right, the GloVe Siamese network's loss over 5 epochs. Training loss falls steadily from 0.5952 to 0.4904. Validation loss starts at 0.5839 and rises every epoch to 0.6358. A note says the network starts memorising instead of generalising after epoch 1, and that validation accuracy peaked at 69.52% in epoch 4.](./results.png)

On the left, notice how far the two combined models sit from the two single networks. On the right, notice the two lines heading in opposite directions after the first pass.

## Two things that fought back

### Learning nothing at first

Before the full run, we trained on just 2,000 pairs to check that everything worked. For all ten passes, the score on the held-back pairs sat at exactly 62.50%, which is what you get by always saying "not a duplicate". On a small sample, the network found the lazy answer first.

### Memorising instead of learning

On the full data, the GloVe network's training loss fell every pass, from 0.5952 to 0.4904. Its loss on the held-back validation pairs did the opposite, rising every pass after the first, from 0.5839 to 0.6358. The network was getting better at the pairs it had seen and worse at new ones. Its validation accuracy peaked at 69.52% in the fourth pass, but training ran for a fixed five, so the saved network is the one from the end.

## What's still rough

**The single networks barely beat the lazy answer.** 68.75% is about five and a half points above always saying "no".

**Accuracy is the only score.** With a 37/63 split, precision and recall on the duplicate class would say a lot more about how useful it is.

**It overfits.** There's no early stopping, so the five-pass network is past its best.

## What we'd tell someone starting out

1. **Work out your floor first.** If 63% of pairs are "no", a model that always says "no" scores 63%. Beat that, not 50%.
2. **Try the simple baseline.** Counting shared words takes a few lines and shows how little word overlap buys you.
3. **Share the weights.** One reader for both questions keeps the comparison fair and the reader reusable.
4. **Watch the validation loss, not the training accuracy.** Ours was rising from the second pass on.
5. **Your domain changes what words mean.** On Quora, "cat" is an exam.
6. **Two middling models can make a better one.** Neither network beat 69% on the test pairs; together they reached 75%.

Two questions in, one probability out, and three times out of four, the right answer.

## The code

The notebook is on GitHub: [tysonthomas9/Siamese-Neural-Network-Detect-Duplicate-Question-Pair](https://github.com/tysonthomas9/Siamese-Neural-Network-Detect-Duplicate-Question-Pair). It's a Colab notebook, so expect Drive-mounting cells. It also has a Doc2Vec experiment at the end that isn't part of the model.

## Credits

This was a team effort. It stands on open work and open data: Quora and Kaggle's [Quora Question Pairs](https://www.kaggle.com/c/quora-question-pairs/data) dataset, Stanford's [GloVe](https://nlp.stanford.edu/projects/glove/) vectors, and the Keras, TensorFlow, gensim, NLTK and scikit-learn libraries.
