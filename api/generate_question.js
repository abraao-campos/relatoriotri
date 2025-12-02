// api/generate_question.js
const { GoogleGenAI } = require('@google/genai');

// Força a utilização da variável de ambiente CHAVE
// A CHAVE DEVE SER CONFIGURADA NO SEU AMBIENTE (ex: Vercel Secrets, .env)
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY 
}); 

// Função auxiliar para extrair o bloco JSON do texto da IA
function extractJsonBlock(text) {
    // Procura o bloco de código que começa com ```json
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            return JSON.parse(jsonMatch[1]);
        } catch (e) {
            console.error("Erro ao fazer parse do JSON extraído:", e);
            throw new Error("A IA gerou a questão, mas o formato JSON retornado é inválido.");
        }
    }
    throw new Error("A IA não retornou o bloco JSON formatado corretamente (use ```json{...}```). Tente gerar novamente.");
}


// --- Handler Principal (Exportação) ---
module.exports = async (req, res) => {
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: "Método não permitido. Use POST." });
    }

    try {
        if (!process.env.GEMINI_API_KEY) {
             throw new Error("Variável de ambiente GEMINI_API_KEY não está definida. Verifique a configuração do seu host.");
        }
        
        const { parametros } = req.body;
        
        if (!parametros || !parametros.Componente_Curricular || !parametros.Objeto_do_Conhecimento) {
            return res.status(400).json({ success: false, error: "Parâmetros obrigatórios (Componente Curricular, Objeto do Conhecimento) não fornecidos." });
        }
        
        // --- 1. CONSTRUÇÃO DO PROMPT DE 9 ETAPAS ---
        // Este prompt segue rigorosamente as suas 9 etapas
        const promptCompleto = `
            Você é um Elaborador de Itens de Alta Proficiência, especializado na construção de questões preparatórias para o ENEM (Exame Nacional do Ensino Médio). Seu objetivo é gerar uma questão completa, altamente alinhada aos padrões da Matriz de Referência do ENEM e às diretrizes curriculares, utilizando a pesquisa na internet para embasamento de conteúdo e suporte.

            ---
            **INSTRUÇÕES METODOLÓGICAS (9 Etapas)**

            1ª Etapa - Bases Curriculares e Metodológicas: Pesquise e use como referência obrigatória, no seu processo de construção de parâmetros, o conteúdo integral dos três documentos: **BNCC (Base Nacional Comum Curricular)**, **DCRC (Documento Curricular Referencial do Ceará)** e **MATRIZ (Matriz de Referência do ENEM: Eixos Cognitivos, Competências e Habilidades)**.
            
            2ª Etapa - Conformidade com o ENEM: O item gerado deve obedecer rigorosamente às características de elaboração das provas do ENEM (estrutura de Suporte, Enunciado, Comando e Distratores Plausíveis).
            
            3ª Etapa - Definição de Conteúdo: A elaboração será guiada por: Componente Curricular, Objeto do Conhecimento, Etapa de Ensino e Dificuldade (se informados).
            
            4ª Etapa - Temática e Contexto: Use a Temática e Contexto para contextualizar o conteúdo da questão.
            
            5ª Etapa - Alinhamento da Matriz ENEM: O item será elaborado priorizando a Competência e a Habilidade informadas. Se não fornecidas, escolha a Competência e Habilidade da Matriz que melhor se encaixarem no Objeto do Conhecimento e na Temática.
            
            6ª Etapa - Estrutura do Item: O item deve conter os quatro elementos essenciais: **Suporte** (Texto, imagem, gráfico, tabela etc.), **Enunciado** (Contextualização do problema), **Comando** (A pergunta ou solicitação clara de resolução) e **Alternativas** (Cinco opções: A, B, C, D e E).
            
            7ª Etapa - Uso da Pesquisa na Internet: Utilize a busca na web (ferramenta Google Search) para buscar o Suporte (dados, textos, gráficos, referências culturais) e demais informações necessárias para a elaboração do conteúdo.
            
            8ª Etapa - Gabarito: Informe a alternativa correta (A, B, C, D ou E).
            
            9ª Etapa - Justificativa Comentada: Elabore um comentário curto e objetivo explicando: Os motivos que tornam a alternativa correta o gabarito e o porquê de cada uma das demais alternativas estar errada (Função de Distrator).

            ---
            **PARÂMETROS FORNECIDOS PELO USUÁRIO**

            * **Área do Conhecimento (OBRIGATÓRIO):** ${parametros.Area_do_Conhecimento}
            * **Componente Curricular (OBRIGATÓRIO):** ${parametros.Componente_Curricular}
            * **Objeto do Conhecimento (OBRIGATÓRIO):** ${parametros.Objeto_do_Conhecimento}
            * **Competência (Opcional):** ${parametros.Competencia || 'Não Informada - Escolha a mais adequada'}
            * **Habilidade (Opcional):** ${parametros.Habilidade || 'Não Informada - Escolha a mais adequada'}
            * **Etapa de Ensino (Opcional):** ${parametros.Etapa_de_Ensino || 'Não Informada'}
            * **Dificuldade do Item (Opcional):** ${parametros.Dificuldade_do_Item || 'Não Informada (Dificuldade Padrão)'}
            * **Temática e Contexto (Opcional):** ${parametros.Tematica_e_Contexto || 'Não Informada'}

            ---
            **FORMATO DE SAÍDA (OBRIGATÓRIO)**

            Você deve retornar **APENAS** um objeto JSON em um bloco de código \`\`\`json\`\`\` que contenha **todos** os campos abaixo. **NÃO INCLUA NENHUM TEXTO ANTES OU DEPOIS DO BLOCO JSON.**

            \`\`\`json
            {
              "Componente_Curricular": "...",
              "Competencia_Habilidade": "Competência de Área X / Habilidade Y (O valor real escolhido na Etapa 5).",
              "Suporte": "Texto do Suporte (Artigo, Gráfico, Tabela, Citação, etc. Obtido via pesquisa. Seja descritivo, evite placeholders como '[IMAGEM]').",
              "Enunciado": "Contextualização do problema, situando o leitor (sem a pergunta).",
              "Comando": "A pergunta clara e objetiva de resolução, que encerra o Enunciado e solicita a ação do aluno.",
              "Alternativas": {
                "A": "Texto da alternativa A.",
                "B": "Texto da alternativa B.",
                "C": "Texto da alternativa C.",
                "D": "Texto da alternativa D.",
                "E": "Texto da alternativa E."
              },
              "Gabarito": "Letra da alternativa correta (A, B, C, D ou E).",
              "Justificativa_Comentada": "Comentário curto e objetivo explicando: 1. Por que o Gabarito está correto (ligação com a Habilidade). 2. A função de distrator das demais alternativas (o erro comum que elas induzem)."
            }
            \`\`\`
        `;
        
        // --- 2. CHAMADA À API GEMINI COM PESQUISA NA WEB ---
        const result = await ai.models.generateContent({
            model: 'gemini-1.5-flash', // Recomendado por ser rápido e ter boa capacidade de raciocínio e pesquisa
            contents: promptCompleto,
            config: {
                tools: [{ googleSearch: {} }], // Ativa a busca na web (Etapa 7)
            }
        });
        
        const fullResponseText = result.text;
        
        // --- 3. EXTRAÇÃO E VALIDAÇÃO DO JSON ---
        const questaoGerada = extractJsonBlock(fullResponseText);

        // --- 4. RETORNO DE SUCESSO ---
        return res.status(200).json({
            success: true,
            questao: questaoGerada, 
            error: null 
        });

    } catch (e) {
        console.error("ERRO NA GERAÇÃO DE QUESTÃO:", e);
        
        // Retorna a mensagem de erro para o frontend
        return res.status(500).json({
            success: false,
            error: e.message || "Erro interno ao processar a geração da questão."
        });
    }
};