// Importa o SDK do Google Gen AI
const { GoogleGenAI } = require('@google/genai');

// O NOVO NOME DA CHAVE QUE DEVE SER CONFIGURADA NO VERCEL
const API_KEY_NAME = 'VERCEL_GEMINI_KEY';

// Inicializa o SDK, passando explicitamente a chave
const ai = new GoogleGenAI({ 
    apiKey: process.env[API_KEY_NAME] 
});

// PROMPT OBRIGANDO A ESTRUTURAÇÃO DE SAÍDA EM 3 PARTES: JSON | MÉTRICAS SIMPLIFICADAS | OBSERVAÇÕES
const FIXED_PROMPT = 
  `Você é um motor de análise de resultados de provas focado em precisão. Sua tarefa é comparar a Matriz de Respostas dos Alunos com o Gabarito (Gabarito) e gerar um relatório de acertos e erros para cada aluno.

  ### DADOS DE ENTRADA:
  Ambos os arquivos (Gabarito e Respostas) estão formatados como Strings JSON.
  
  ### METODOLOGIA E RESULTADO:
  O seu relatório final **DEVE** ser fornecido em três partes distintas, rigorosamente nesta ordem:
  
  --- PARTE 1: JSON DETALHADO POR ALUNO ---
  Forneça uma lista JSON (Array de Objetos) com os resultados de CADA aluno. Esta lista DEVE estar obrigatoriamente dentro de um bloco de código Markdown \`\`\`json.
  
  Cada objeto no array deve conter as seguintes chaves:
    - \`Aluno\`: (Nome do aluno)
    - \`Total_Questoes\`: (Número total de questões na prova)
    - \`Acertos\`: (Número de respostas corretas)
    - \`Erros\`: (Número de respostas incorretas ou em branco)
    - \`Percentual_Acerto\`: (Acertos / Total de Questoes * 100, formatado com uma casa decimal)
  
  --- PARTE 2: MÉTRICAS SIMPLIFICADAS (MARKDOWN) ---
  O texto das métricas deve vir IMEDIATAMENTE após o bloco \`\`\`json. Ele deve OBRIGATORIAMENTE começar com o título **## Resumo Executivo da Turma** seguido de UMA LISTA SIMPLES em Markdown com TRÊS itens formatados com negrito, contendo APENAS o número ou a contagem de acertos:
  
  1.  **Média de Acertos**: (O valor numérico da média de acertos, SEM o símbolo de % ou o nome 'Acertos'. Ex: 25)
  2.  **Maior Pontuação**: (A maior pontuação alcançada, APENAS o número. Ex: 40)
  3.  **Menor Pontuação**: (A menor pontuação alcançada, APENAS o número. Ex: 15)
  
  --- PARTE 3: OBSERVAÇÕES GERAIS (BLOCO DE CÓDIGO) ---
  Forneça a análise em texto corrido (em parágrafos ou com bullet points) logo após a lista de métricas, dentro de um bloco de código Markdown **\`\`\`text** com o título **Observações Gerais:**.
  
  Este bloco DEVE incluir:
  - O nome dos alunos que alcançaram a maior pontuação.
  - O nome dos alunos que alcançaram a menor pontuação.
  - Análise detalhada das áreas de acerto e dificuldade.

  Exemplo de formato esperado para a PARTE 3:
  \`\`\`text
  Observações Gerais:
  A maior pontuação (40 acertos) foi alcançada pelo(a) aluno(a) Bruno Santos. A menor pontuação (15 acertos) foi do(a) aluno(a) Mário Dantas.
  - O desempenho da turma foi mediano, com a maioria dos alunos concentrada entre 60% e 75% de acerto.
  - A maior dificuldade foi na Competência 5, Habilidade 23 (Direitos e Deveres).
  \`\`\`

  Abaixo, estão os dados. Seja rigoroso na separação dos dados de entrada e na comparação do gabarito.
  `;

// Função principal da API
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido. Use POST.' });
        return;
    }

    // >> VERIFICAÇÃO CRÍTICA: Se a variável de ambiente não existe, retorne um erro único.
    if (!process.env[API_KEY_NAME] || process.env[API_KEY_NAME].trim() === "") {
        return res.status(500).json({ 
            success: false, 
            error: `ERRO CRÍTICO DE AMBIENTE (CÓDIGO: NO_KEY): A chave '${API_KEY_NAME}' não foi encontrada ou está vazia no servidor Vercel. Por favor, verifique se a variável está configurada para o ambiente 'Production' e faça um novo 'Redeploy'.` 
        });
    }

    try {
        // 1. Receber os DOIS conteúdos do corpo da requisição
        const { gabaritoContent, resultadosContent, gabaritoFilename, resultadosFilename } = req.body;

        if (!gabaritoContent || !resultadosContent) {
            res.status(400).json({ error: 'Os conteúdos do Gabarito e dos Resultados são obrigatórios.' });
            return;
        }

        // 2. Montar o conteúdo completo para o Gemini com ambos os arquivos
        const fullPrompt = 
          `${FIXED_PROMPT}\n\n` +
          `--- GABARITO (${gabaritoFilename}) ---\n` +
          `${gabaritoContent}\n\n` +
          `--- RESPOSTAS DOS ALUNOS (${resultadosFilename}) ---\n` +
          `${resultadosContent}`;
        
        // 3. Fazer a chamada à API do Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', 
            contents: fullPrompt,
            config: {
                temperature: 0.2, // Temperatura mais baixa para garantir precisão
            }
        });

        const analysisText = response.text;

        // 4. Retornar o resultado da análise para o frontend
        res.status(200).json({
            success: true,
            analysis: analysisText
        });

    } catch (error) {
        console.error("Erro na análise do Gemini:", error);
        res.status(500).json({ 
            success: false, 
            error: 'Falha na comunicação com o motor de análise. A chave pode estar incorreta. Detalhes: ' + error.message,
            details: error.message
        });
    }
};
