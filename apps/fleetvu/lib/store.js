import fs from "node:fs";
import path from "node:path";
import { createLearningState } from "./learning.js";

export function createStore(file) {
  function empty() {
    return {
      equipment: [],
      issues: [],
      registrations: [],
      invites: [],
      learning: createLearningState(),
    };
  }

  function load() {
    if (!fs.existsSync(file)) return empty();
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed.learning) parsed.learning = createLearningState();
    parsed.equipment ||= [];
    parsed.issues ||= [];
    parsed.registrations ||= [];
    parsed.invites ||= [];
    return parsed;
  }

  function save(data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  return {
    read: load,
    update(mutator) {
      const data = load();
      const result = mutator(data);
      save(data);
      return result === undefined ? data : result;
    },
  };
}
