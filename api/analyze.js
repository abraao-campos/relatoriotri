// Importa o SDK do Google Gen AI
const { GoogleGenAI } = require('@google/genai');

// A chave da API será lida automaticamente de GEMINI_API_KEY
const ai = new GoogleGenAI({});

// PROMPT SIMPLIFICADO: Instruções para Contagem de Acertos/Erros
const FIXED_PROMPT = 
  `Você é um motor de análise de resultados de provas focado em precisão.
  
  Sua tarefa é comparar a Matriz de Respostas dos Alunos com o Gabarito (Gabarito) e gerar um relatório de acertos e erros para cada aluno.

  ### DADOS DE ENTRADA:
  Ambos os arquivos (Gabarito e Respostas) foram pré-processados e estão formatados como **Strings JSON, representando Arrays de Objetos**. Use esta estrutura de dados diretamente.
  
  --- FASE 1: GABARITO (JSON) ---
  Contém a resposta correta para cada questão. A chave para a questão será o número da questão (Ex: "1", "2").
  
  --- FASE 2: RESPOSTAS DOS ALUNOS (JSON) ---
  Contém as respostas de cada aluno. A chave para o nome do aluno é "Nome", e as demais chaves são os números das questões.
  
  ### METODOLOGIA E CÁLCULOS:
  1. **Processamento:** Itere sobre a Matriz de Respostas. Para cada aluno, compare a resposta de cada questão com o Gabarito correspondente.
  2. **Contagem:** Conte o número total de acertos e erros (incluindo questões em branco/sem marcação) por aluno.
  3. **Relatório:** Gere um relatório final.

  ### RESULTADO:
  O seu relatório final **DEVE** ser fornecido no formato JSON com as seguintes chaves, seguido de um resumo em Markdown:
  
  - **relatorio_alunos_json**: Uma lista JSON com objetos, cada um contendo:
    - \`Aluno\`: (Nome do aluno)
    - \`Total_Questoes\`: (Número total de questões na prova)
    - \`Acertos\`: (Número de respostas corretas)
    - \`Erros\`: (Número de respostas incorretas ou em branco)
    - \`Percentual_Acerto\`: (Acertos / Total de Questoes * 100, formatado com uma casa decimal)
  
  - **resumo_executivo_markdown**: Um relatório em Markdown com:
    - Média de Acertos da Turma.
    - O aluno com a maior pontuação e o aluno com a menor pontuação.
    - Observações gerais sobre o desempenho da turma.

  Abaixo, estão os dados. Seja rigoroso na separação dos dados de entrada e na comparação do gabarito.
  `;

// Função principal da API
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Método não permitido. Use POST.' });
        return;
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
            error: 'Falha na comunicação com o motor de análise. O servidor pode estar sobrecarregado ou a API Key expirou. Detalhes: ' + error.message,
            details: error.message
        });
    }
};
