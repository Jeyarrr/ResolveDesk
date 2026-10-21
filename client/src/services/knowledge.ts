import { articles } from '../data/seed';
export const knowledgeService = { list: async () => structuredClone(articles) };
