/**
 * Quick steps: while the agent is operating the computer, each model request
 * is "look at the screenshot, pick the next click". Deliberating over that
 * costs seconds per step and is what makes the motion feel halting, so those
 * requests can run at the model's lowest reasoning effort. Requests that are
 * not part of operating (planning from the user's message, turns that never
 * touch the computer) keep the session's own setting.
 */
/**
 * Has this turn started operating the computer: is there a result of one of
 * this plugin's tools since the user's last message?
 *
 * It has to hold for the rest of the turn, not only right after such a result:
 * the replies written at the lowered effort carry no reasoning, and a provider
 * in thinking mode refuses a turn whose earlier tool-calling replies lack it
 * (DeepSeek: "content[].thinking ... must be passed back"). So once a turn has
 * a reply written without thinking, every later request of that turn goes
 * without it too.
 */
export declare function isOperating(messages: readonly unknown[], ownTools: ReadonlySet<string>): boolean;
/** The lowest reasoning effort a model offers, or undefined when it offers none we recognise. */
export declare function lowestEffort(efforts: readonly {
    id: string;
}[] | undefined): string | undefined;
/**
 * Without deliberation the model now and then writes a tool call whose
 * arguments are not valid JSON, which the adapter raises as
 * MALFORMED_RESPONSE and which would end the turn. Such a reply is thrown
 * away and asked for again. The reply is held back until it is complete, as
 * events already passed on could not be taken back.
 */
export declare function retryMalformed<T>(run: () => AsyncIterable<T>, attempts?: number): AsyncGenerator<T>;
