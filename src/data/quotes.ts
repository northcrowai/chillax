export interface FocusQuote {
  author: string
  sourceUrl: string
  text: string
  work: string
}

export const FOCUS_QUOTES: readonly FocusQuote[] = [
  {
    author: 'Marcus Aurelius',
    sourceUrl: 'https://www.gutenberg.org/files/15877/15877-h/15877-h.htm',
    text: 'Let no act be done without a purpose, nor otherwise than according to the perfect principles of art.',
    work: 'Meditations',
  },
  {
    author: 'Epictetus',
    sourceUrl: 'https://www.gutenberg.org/files/45109/old/45109-h/45109-h.htm',
    text: 'Men are disturbed not by things, but by the views which they take of things.',
    work: 'The Enchiridion',
  },
  {
    author: 'Henry David Thoreau',
    sourceUrl: 'https://www.gutenberg.org/files/205/205-h/205-h.htm',
    text: 'To affect the quality of the day, that is the highest of arts.',
    work: 'Walden',
  },
  {
    author: 'Ralph Waldo Emerson',
    sourceUrl: 'https://www.gutenberg.org/files/2944/2944-h/2944-h.htm',
    text: 'Nothing can bring you peace but yourself.',
    work: 'Self-Reliance',
  },
  {
    author: 'William James',
    sourceUrl: 'https://www.gutenberg.org/cache/epub/57628/pg57628-images.html',
    text: 'My experience is what I agree to attend to.',
    work: 'The Principles of Psychology',
  },
  {
    author: 'Seneca',
    sourceUrl: 'https://en.wikisource.org/wiki/On_the_shortness_of_life/Chapter_I',
    text: 'It is not that we have a short space of time, but that we waste much of it.',
    work: 'On the Shortness of Life',
  },
  {
    author: 'René Descartes',
    sourceUrl: 'https://web.viu.ca/johnstoi/descartes/descartes1.htm',
    text: 'It is not enough to have a good mind. The main thing is to apply it well.',
    work: 'Discourse on Method',
  },
  {
    author: 'Baruch Spinoza',
    sourceUrl: 'https://www.gutenberg.org/files/3800/3800-h/3800-h.htm',
    text: 'All things excellent are as difficult as they are rare.',
    work: 'Ethics',
  },
  {
    author: 'Walt Whitman',
    sourceUrl: 'https://www.gutenberg.org/files/1322/old/1322-h/1322-h.htm',
    text: 'I exist as I am, that is enough.',
    work: 'Leaves of Grass',
  },
  {
    author: 'James Allen',
    sourceUrl: 'https://www.gutenberg.org/files/4507/4507-h/4507-h.htm',
    text: 'Calmness of mind is one of the beautiful jewels of wisdom.',
    work: 'As a Man Thinketh',
  },
] as const

export function getRandomFocusQuote(random: () => number = Math.random): FocusQuote {
  const sample = random()
  const normalized = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999_999) : 0
  return FOCUS_QUOTES[Math.floor(normalized * FOCUS_QUOTES.length)]
}
