import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { type SkillStore } from './skills.js';
import { Computer, type CallContext, type Shot } from './computer.js';
type ToolDefinition = ReturnType<typeof defineTool>;
export interface ToolHost {
    computer: Computer;
    /** Persist an image so the model can see it. */
    saveImage(shot: Shot, name: string): Promise<ImageAttachmentRef>;
    /** Build the per-call context (session, agent, vision support). */
    context(exec: unknown): Promise<CallContext>;
    /** Per-app notes the agent keeps (optional: tests run without). */
    skills?: SkillStore;
}
export declare function createTools(host: ToolHost): ToolDefinition[];
export {};
