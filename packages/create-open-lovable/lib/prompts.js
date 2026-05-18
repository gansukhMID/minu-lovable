export function getPrompts(config) {
  const prompts = [];

  if (!config.name) {
    prompts.push({
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: 'my-open-lovable',
      validate: (input) => {
        if (!input || input.trim() === '') {
          return 'Project name is required';
        }
        if (!/^[a-z0-9-_]+$/i.test(input)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      }
    });
  }

  if (!config.sandbox) {
    prompts.push({
      type: 'list',
      name: 'sandbox',
      message: 'Sandbox provider (register more in lib/sandbox/factory.ts):',
      choices: [
        {
          name: 'Minu — custom HTTP sandbox backend',
          value: 'minu',
          short: 'Minu'
        }
      ],
      default: 'minu'
    });
  }

  prompts.push({
    type: 'confirm',
    name: 'configureEnv',
    message: 'Would you like to configure API keys now?',
    default: true
  });

  return prompts;
}

export function getEnvPrompts(provider) {
  const prompts = [];

  if (provider === 'minu') {
    prompts.push({
      type: 'input',
      name: 'minuSandboxUrl',
      message: 'Minu sandbox API base URL:',
      default: 'http://192.168.110.93:8080'
    });
    prompts.push({
      type: 'input',
      name: 'minuSandboxHost',
      message: 'Minu preview hostname (used in iframe URL):',
      default: '192.168.110.93'
    });
  }

  prompts.push({
    type: 'confirm',
    name: 'addAiKeys',
    message: 'Would you like to add AI provider API keys?',
    default: true
  });

  prompts.push({
    type: 'checkbox',
    name: 'aiProviders',
    message: 'Select AI providers to configure:',
    when: (answers) => answers.addAiKeys,
    choices: [
      { name: 'Anthropic (Claude)', value: 'anthropic' },
      { name: 'OpenAI (GPT)', value: 'openai' },
      { name: 'Google (Gemini)', value: 'gemini' },
      { name: 'Groq', value: 'groq' }
    ]
  });

  prompts.push({
    type: 'input',
    name: 'anthropicApiKey',
    message: 'Anthropic API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('anthropic')
  });

  prompts.push({
    type: 'input',
    name: 'openaiApiKey',
    message: 'OpenAI API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('openai')
  });

  prompts.push({
    type: 'input',
    name: 'geminiApiKey',
    message: 'Gemini API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('gemini')
  });

  prompts.push({
    type: 'input',
    name: 'groqApiKey',
    message: 'Groq API key:',
    when: (answers) => answers.aiProviders && answers.aiProviders.includes('groq')
  });

  return prompts;
}
