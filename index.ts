import "dotenv/config";
import { BaseMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { convertToOpenAIFunction } from "@langchain/core/utils/function_calling";
import { END, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

interface State {
  messages: BaseMessage[];
}

const agent = async (state: State, config?: RunnableConfig) => {
  const functions = [
    new DynamicStructuredTool({
      name: "research",
      description: "Use this tool to research",
      schema: z.object({
        do_research: z.boolean(),
      }),
      async func({ do_research }) {
        return JSON.stringify(do_research);
      },
    }),
  ].map(convertToOpenAIFunction);

  const model = new ChatOpenAI({
    temperature: 0,
    modelName: "gpt-3.5-turbo",
    streaming: true,
  }).bind({
    functions,
  });

  const response = await model.invoke(
    [state.messages[0]!.content.toString()],
    config
  );
  return {
    messages: [response],
  };
};

const createLangGraph = () => {
  const state = {
    messages: {
      value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
      default: () => [],
    },
  };

  const workflow = new StateGraph({
    channels: state,
  });

  workflow.addNode("agent", agent);

  workflow.setEntryPoint("agent");

  workflow.addEdge("agent", END);

  const app = workflow.compile();

  return app;
};

const sendMessage = async (message: string) => {
  const app = createLangGraph();

  const stream = app.streamLog({
    messages: [{ content: message, role: "user" }],
  });

  let result = "";
  for await (const chunk of stream) {
    if (chunk.ops?.length > 0 && chunk.ops[0]?.op === "add") {
      const addOpp = chunk.ops[0];

      console.log("chunk", JSON.stringify(chunk, null, 2));

      if (
        addOpp.path.startsWith("/logs/ChatOpenAI") &&
        typeof addOpp.value === "string" &&
        addOpp.value.length
      ) {
        result += addOpp.value;
      }
    }
  }

  console.log("result", result);
};

sendMessage("Hello, how are you?");
