// Importa o SDK do Google Gen AI
const { GoogleGenAI } = require('@google/genai');

// 🔑 A chave da API será lida automaticamente de GEMINI_API_KEY
const ai = new GoogleGenAI({});

// 📝 PROMPT FIXO: Instruções Detalhadas para Análise TRI (M2PL)
const FIXED_PROMPT = 
  `Você é um motor de análise estatística especializado em **Teoria de Resposta ao Item (TRI)**.
  
  Sua tarefa primordial é **pré-processar e interpretar** os dois conjuntos de dados brutos fornecidos (Gabarito e Respostas dos Alunos), que podem estar em formatos variados (CSV, JSON, Texto Delimitado), para **garantir a consistência** antes do cálculo.

  ### FASE DE INTERPRETAÇÃO E NORMALIZAÇÃO DE DADOS:
  1. **Identificação do Formato:** Determine automaticamente que o separador padrão é a **vírgula (,)** e que os dados estão estruturados como tabelas.
  2. **Mapeamento de Colunas:** Para a Matriz de Respostas, identifique qual coluna representa o 'Nome do Aluno' e quais colunas representam as 'Respostas'.
  3. **Validação:** Descarte quaisquer linhas de cabeçalho ou rodapé irrelevantes.
  
  Após a interpretação e normalização, realize a simulação do cálculo TRI M2PL conforme instruído nas fases seguintes.

  --- FASE 1: BANCO DE DADOS DA PROVA ---
  Este arquivo contém as características de cada item (questão): Habilidade (H) e Gabarito.
  
  --- FASE 2: MATRIZ DE RESPOSTAS DOS ALUNOS ---
  Este arquivo contém as respostas marcadas por cada aluno.
  
  ### METODOLOGIA E CÁLCULOS:
  1. **Conversão Binária:** Converta as respostas dos alunos para uma Matriz de Respostas Binária (1 = Acerto, 0 = Erro), usando o Gabarito (Gabarito) como chave.
  2. **Calibração M2PL:** SIMULE a calibração dos itens (cálculo dos parâmetros 'a' - Discriminação e 'b' - Dificuldade) sobre a amostra de alunos fornecida.
  3. **Proficiência TRI ($\theta$):** Calcule a proficiência ($\theta$) de cada aluno em escala logit (Proficiência bruta).
  4. **Padronização ENEM:** Transforme a proficiência $\theta$ para a Escala ENEM, onde a Média $\approx 500$ e o Desvio Padrão ($\text{DP}$) $\approx 100$.

  ### RESULTADO (FASE 3):
  Seu relatório final **DEVE** ser fornecido no formato JSON com as seguintes chaves, seguido de um resumo em Markdown:
  
  - **relatorio_alunos_json**: Uma lista JSON com objetos, cada um contendo:
    - \`Aluno\`: (Nome do aluno)
    - \`Proficiencia_TRI_Logit\`: (Valor de $\theta$)
    - \`Proficiencia_ENEM_Padronizada\`: (Valor Padronizado)
  
  - **resumo_executivo_markdown**: Um relatório em Markdown com:
    - Média e DP da Proficiência Padronizada da turma.
    - As 3 Habilidades (H) com o menor desempenho.
    - Sugestões pedagógicas baseadas nas Habilidades fracas.

  Abaixo, estão os dados. **Seja rigoroso na separação dos dados de entrada e na aplicação do modelo TRI M2PL.**
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

        // VERIFICAÇÃO FINAL: Se os conteúdos vieram nulos ou vazios, retorna erro 400
        if (!gabaritoContent || !resultadosContent) {
            res.status(400).json({ error: 'Os conteúdos do Gabarito e dos Resultados são obrigatórios.' });
            return;
        }

        // 2. Montar o conteúdo completo para o Gemini com ambos os arquivos
        const fullPrompt = 
          `${FIXED_PROMPT}\n\n` +
          `--- BANCO DE DADOS DA PROVA (${gabaritoFilename}) ---\n` +
          `${gabaritoContent}\n\n` +
          `--- MATRIZ DE RESPOSTAS DOS ALUNOS (${resultadosFilename}) ---\n` +
          `${resultadosContent}`;
        
        // 3. Fazer a chamada à API do Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', 
            contents: fullPrompt,
            config: {
                temperature: 0.5, 
            }
        });

        const analysisText = response.text;

        // 4. Retornar o resultado da análise para o frontend
        res.status(200).json({
            success: true,
            analysis: analysisText,
            prompt: FIXED_PROMPT.substring(0, 150) + '...'
        });

    } catch (error) {
        console.error("Erro na análise do Gemini:", error);
        res.status(500).json({ 
            success: false, 
            // Mensagem de erro mais genérica para o usuário
            error: 'Falha na comunicação com o motor de análise TRI. O formato dos seus arquivos pode estar impedindo o processamento.',
            details: error.message
        });
    }
};
