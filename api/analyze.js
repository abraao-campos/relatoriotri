// ... (imports e setup da API)
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({});

// 📝 PROMPT FIXO: Instruções Detalhadas para Análise TRI (M2PL)
const FIXED_PROMPT = 
  `Você é um motor de análise estatística especializado em **Teoria de Resposta ao Item (TRI)**.
  
  Sua tarefa é simular um processo de calibração e cálculo de proficiência utilizando o **Modelo Logístico de 2 Parâmetros (M2PL)**.

  ### ATENÇÃO: DADOS DE ENTRADA E NORMALIZAÇÃO
  Os dados a seguir foram pré-processados e estão formatados como **Strings JSON, representando Arrays de Objetos**. Use esta estrutura de dados diretamente para o cálculo.

  --- FASE 1: BANCO DE DADOS DA PROVA ---
  Este JSON contém as características de cada item (questão): Habilidade (H) e Gabarito.
  
  --- FASE 2: MATRIZ DE RESPOSTAS DOS ALUNOS ---
  Este JSON contém as respostas marcadas por cada aluno.
  
  ### METODOLOGIA E CÁLCULOS:
  1. **Conversão Binária:** Converta as respostas dos alunos para uma Matriz de Respostas Binária (1 = Acerto, 0 = Erro), usando o Gabarito como chave.
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

  Abaixo, estão os dados. Seja rigoroso na separação dos dados de entrada e na aplicação do modelo TRI M2PL.
  `;

// ... (o restante do código analyze.js permanece o mesmo, pois o corpo da requisição é tratado da mesma forma)
module.exports = async (req, res) => {
// ...
