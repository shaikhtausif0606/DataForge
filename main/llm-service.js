const settings = require('./settings-store');

function getApiKey() {
  return settings.get('openaiApiKey') || '';
}

function setApiKey(key) {
  settings.set('openaiApiKey', key);
}

function buildContext(sessionData) {
  if (!sessionData || sessionData.length === 0) {
    return 'No research data available.';
  }

  let context = 'Here is the captured research data:\n\n';
  sessionData.forEach((c, i) => {
    context += `--- Capture ${i + 1} ---\n`;
    context += `URL: ${c.url}\n`;
    context += `Page Title: ${c.pageTitle || 'Untitled'}\n`;
    context += `Type: ${c.type}\n`;
    context += `Timestamp: ${c.timestamp}\n`;
    context += `Data: ${JSON.stringify(c.data, null, 2)}\n\n`;
  });
  return context;
}

function getModelConfig() {
  const provider = settings.get('provider') || 'openrouter';
  const modelName = settings.get('model') || 'openrouter/auto';
  const key = getApiKey();

  if (provider === 'openrouter') {
    return {
      apiKey: key,
      model: modelName,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1'
      }
    };
  }

  return {
    apiKey: key,
    model: modelName
  };
}

function buildSystemPrompt(sessionData) {
  const context = buildContext(sessionData);
  return `You are a research assistant helping analyze captured web data. Use the provided research context to answer questions and fulfill requests.

${context}

When asked to create documents:
- For articles/blogs: write full markdown content
- For presentations: describe slide-by-slide content
- For excel/csv: output tabular data in a structured format
- For summaries: be concise and highlight key points

Always base your responses on the actual research data provided.`;
}

async function chat(sessionData, messages) {
  const key = getApiKey();
  if (!key) {
    throw new Error('API key not set. Please add your API key in Settings.');
  }

  const { ChatOpenAI } = await import('@langchain/openai');
  const { SystemMessage, HumanMessage, AIMessage } = await import('@langchain/core/messages');

  const modelConfig = getModelConfig();
  const model = new ChatOpenAI({
    apiKey: modelConfig.apiKey,
    model: modelConfig.model,
    configuration: modelConfig.configuration,
    temperature: 0.7
  });

  const langChainMessages = [new SystemMessage(buildSystemPrompt(sessionData))];
  for (const msg of messages) {
    if (msg.role === 'user') {
      langChainMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      langChainMessages.push(new AIMessage(msg.content));
    }
  }

  const response = await model.invoke(langChainMessages);
  return response.content;
}

async function* chatStream(sessionData, messages) {
  const key = getApiKey();
  if (!key) {
    throw new Error('API key not set. Please add your API key in Settings.');
  }

  const { ChatOpenAI } = await import('@langchain/openai');
  const { SystemMessage, HumanMessage, AIMessage } = await import('@langchain/core/messages');

  const modelConfig = getModelConfig();
  const model = new ChatOpenAI({
    apiKey: modelConfig.apiKey,
    model: modelConfig.model,
    configuration: modelConfig.configuration,
    temperature: 0.7,
    streaming: true
  });

  const langChainMessages = [new SystemMessage(buildSystemPrompt(sessionData))];
  for (const msg of messages) {
    if (msg.role === 'user') {
      langChainMessages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant') {
      langChainMessages.push(new AIMessage(msg.content));
    }
  }

  const stream = await model.stream(langChainMessages);
  for await (const chunk of stream) {
    yield chunk.content;
  }
}

module.exports = { setApiKey, getApiKey, chat, chatStream };
