import type { StoryboardObject, StoryboardTrigger, StoryboardTriggerRun } from './events';

export type StoryboardHitSoundEvent = {
  beatmapMs: number;
  normalSet: number;
  additionSet: number;
  sampleIndex: number;
  type: 'normal' | 'whistle' | 'finish' | 'clap';
  objectId: string | number;
};

type TriggerFilter = {
  normalSet: number | null;
  additionSet: number | null;
  addition: string | null;
  sampleIndex: number | null;
};

function sampleSet(name: string | undefined): number | null {
  return ({ normal: 1, soft: 2, drum: 3 } as Record<string, number>)[name?.toLowerCase() ?? ''] ?? null;
}

function parseFilter(name: string): TriggerFilter | null {
  const match = /^HitSound(All|Normal|Soft|Drum)?(All|Normal|Soft|Drum)?(Whistle|Clap|Finish)?(\d+)?$/i.exec(name);
  if (!match) return null;
  const singleAdditionBank = match[1] !== undefined && match[2] === undefined && match[3] !== undefined;
  return {
    normalSet: singleAdditionBank ? null : sampleSet(match[1]),
    additionSet: singleAdditionBank ? sampleSet(match[1]) : sampleSet(match[2]),
    addition: match[3]?.toLowerCase() ?? null,
    sampleIndex: match[4] === undefined ? null : Number(match[4]),
  };
}

function matches(filter: TriggerFilter, event: StoryboardHitSoundEvent): boolean {
  return (filter.normalSet === null || filter.normalSet === event.normalSet)
    && (filter.additionSet === null || filter.additionSet === event.additionSet)
    && (filter.addition === null || filter.addition === event.type)
    && (filter.sampleIndex === null || filter.sampleIndex === event.sampleIndex);
}

function commandRange(trigger: StoryboardTrigger): { start: number; end: number } {
  let start = Infinity;
  let end = -Infinity;
  for (const command of trigger.commands) {
    start = Math.min(start, command.start);
    end = Math.max(end, command.end);
  }
  return { start, end };
}

export function compileStoryboardTriggers(
  objects: readonly StoryboardObject[],
  events: readonly StoryboardHitSoundEvent[],
): StoryboardObject[] {
  const orderedEvents = [...events].filter((event) => Number.isFinite(event.beatmapMs)).sort((a, b) => a.beatmapMs - b.beatmapMs);
  return objects.map((object) => {
    const triggers = object.triggers ?? [];
    if (triggers.length === 0) return object;
    const definitions = triggers.map((trigger, index) => ({
      trigger, index, filter: parseFilter(trigger.name), range: commandRange(trigger),
    })).filter((definition) => definition.filter !== null && Number.isFinite(definition.range.end));
    const ordinaryEnd = object.commands.reduce((end, command) => Math.max(end, command.end), -Infinity);
    const runs: StoryboardTriggerRun[] = [];
    const activeGroup = new Map<string, StoryboardTriggerRun>();
    const lastActivation = new Map<number, Set<string>>();
    for (const event of orderedEvents) {
      if (event.beatmapMs < ordinaryEnd) continue;
      for (const definition of definitions) {
        const { trigger, index, range, filter } = definition;
        if (event.beatmapMs < trigger.start || event.beatmapMs > trigger.end || !matches(filter!, event)) continue;
        const identity = JSON.stringify([event.beatmapMs, event.objectId]);
        let activated = lastActivation.get(index);
        if (!activated) { activated = new Set(); lastActivation.set(index, activated); }
        if (activated.has(identity)) continue;
        activated.add(identity);
        const key = trigger.group === 0 ? `trigger:${index}` : `group:${trigger.group}`;
        const previous = activeGroup.get(key);
        if (previous && previous.end >= event.beatmapMs) {
          previous.end = event.beatmapMs;
          previous.stopMs = event.beatmapMs;
        }
        const run: StoryboardTriggerRun = {
          start: event.beatmapMs + Math.max(0, range.start),
          end: event.beatmapMs + range.end,
          activationMs: event.beatmapMs,
          commands: trigger.commands.map((command) => ({
            ...command, start: event.beatmapMs + command.start, end: event.beatmapMs + command.end,
          })),
        };
        runs.push(run);
        activeGroup.set(key, run);
      }
    }
    return { ...object, triggerRuns: runs.filter((run) => run.end >= run.start) };
  });
}
