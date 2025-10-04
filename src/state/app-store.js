import { createStore } from './store.js';

export const appStore = createStore({
  vocabs: [],
  serverScores: [],
  gradingResults: {},
  articleMarkdown: ''
});

export const setVocabs = (value) => appStore.set('vocabs', Array.isArray(value) ? [...value] : []);
export const setServerScores = (value) => appStore.set('serverScores', Array.isArray(value) ? [...value] : []);
export const setGradingResults = (value) => appStore.set('gradingResults', value || {});
export const setArticleMarkdown = (value) => appStore.set('articleMarkdown', typeof value === 'string' ? value : '');
