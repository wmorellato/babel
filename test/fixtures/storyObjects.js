const storyA = {
  id: 'storyAid-0123456-0123456',
  title: 'The Creation of a Firefly',
  submissionHistory: {},
  created: 1588294772855,
  versions: []
}

const storyB = {
  id: 'storyBid-0123456-0123456',
  title: 'Hearts and Daggers',
  submissionHistory: {},
  created: 1588294792855,
  versions: []
}

const storyADraft = {
  id: 'storyADraft-3e8c-4b53-9ff1-841415c35c79',
  storyId: 'storyAid-0123456-0123456',
  name: 'draftA',
  wordCount: 1245,
  created: Date.now(),
  statistics: {},
};

const storyBDraft = {
  id: 'storyBDraft-dc49-45d5-96ad-96714c6c382c',
  storyId: 'storyBid-0123456-0123456',
  name: 'draftB',
  wordCount: 1245,
  created: Date.now(),
  statistics: {},
};

const storyBRevision = {
  id: 'storyBRevision-4ca9-4611-93cd-f2d3488bed23',
  storyId: 'storyBid-0123456-0123456',
  name: 'revisionB',
  wordCount: 2356,
  created: Date.now(),
  statistics: {},
};

module.exports = {
  storyA,
  storyB,
  storyADraft,
  storyBDraft,
  storyBRevision,
};
