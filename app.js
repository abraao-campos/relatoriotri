// URL da sua função serverless.
const BACKEND_URL = '/api/analyze'; 

// FUNÇÃO CHAVE: Converte o texto CSV bruto em um Array de Objetos JSON
function csvToJson(csvContent) {
    if (!csvContent) return "[]";
    
    // Solução de Robustez: Limpeza e Normalização de Quebra de Linha
    let normalizedContent = csvContent
        .replace(/\r\n/g, '\n') // Trata Windows CRLF
        .replace(/\r/g, '\n')   // Trata Mac antigo CR
        .replace(/[\u200B-\u200D\uFEFF]/g, ''); // Remove BOM e caracteres invisíveis

    // Divide o conteúdo em linhas e remove linhas vazias/apenas espaço
    const lines = normalizedContent.split('\n').filter(line => line.trim() !== '');

    // Se não houver linhas após a limpeza
    if (lines.length === 0) {
        console.error("CSV vazio após filtragem de linhas.");
        return "[]"; 
    }
    
    // Detecta o separador: tenta ponto-e-vírgula ou vírgula (padrão internacional)
    let separator = lines[0].includes(';') ? ';' : ',';
    
    // Obtém e limpa os cabeçalhos (primeira linha)
    const headers = lines[0].split(separator).map(header => header.trim());
    
    const result = [];
    
    // Itera sobre as linhas de dados (começa da linha 1)
    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine) continue;

        const values = currentLine.split(separator).map(value => value.trim());
        // Garante que o número de colunas bate com o cabeçalho
        if (values.length !== headers.length) {
            console.warn(`Linha ignorada devido a colunas inconsistentes: ${currentLine}`);
            continue;
        }

        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            // Cria o objeto { "Nome da Coluna": "Valor" }
            obj[headers[j]] = values[j];
        }
        result.push(obj);
    }
    
    // Retorna a string JSON compacta
    return JSON.stringify(result, null, 2);
}


// Função auxiliar para ler um arquivo como texto, retornando uma Promise
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

document.getElementById('analiseForm').addEventListener('submit', async function(e) {
    e.preventDefault(); 
    
    const resultadosInput = document.getElementById('arquivoResultados'); // APENAS UM INPUT
    const statusDiv = document.getElementById('status');
    const resultadoTexto = document.getElementById('resultadoTexto');
    const botao = document.getElementById('botaoAnalisar');

    // Verificação básica dos arquivos
    if (resultadosInput.files.length === 0) {
        alert("Por favor, selecione o Arquivo de Resultados da Turma.");
        return;
    }

    // Preparar o estado da interface
   
    botao.disabled = true;
    statusDiv.style.display = 'block';
    
    // >> NOVO TEXTO CURTO E OBJETIVO
    statusDiv.innerHTML = '⏳ Preparando dados...';
    
    statusDiv.classList.add('loading');
    resultadoTexto.textContent = 'Aguarde o processamento...';

    const arquivoResultados = resultadosInput.files[0];

    try {
        // Leitura do arquivo
        const rawResultados = await readFileAsText(arquivoResultados);
        // CONVERTER RAW TEXT (CSV) PARA JSON STRING
        statusDiv.innerHTML = '✨ Lendo e convertendo o arquivo...';
        const jsonResultados = csvToJson(rawResultados);

        // Verifica se a conversão resultou em JSON vazio
        if (jsonResultados === "[]") {
             alert("A conversão JSON falhou. Seu arquivo CSV pode estar vazio ou o formato de codificação é incompatível.");
             botao.disabled = false;
             return;
        }

        // Dados a serem enviados para o backend
        const dadosParaEnvio = {
            resultadosContent: jsonResultados,
            resultadosFilename: arquivoResultados.name
        };
        // Envia os dados para o backend
        await sendToBackend(dadosParaEnvio);
    } catch (error) {
        // Erro de leitura de arquivo (local)
        statusDiv.innerHTML = `❌ Erro ao ler o arquivo: ${error.message}`;
        botao.disabled = false;

    }
});


// Função responsável pela comunicação com o Backend Serverless
async function sendToBackend(data) {
    const statusDiv = document.getElementById('status');
    const botao = document.getElementById('botaoAnalisar');
    const resultadoTexto = document.getElementById('resultadoTexto');

    // >> NOVO TEXTO SIMPLIFICADO DURANTE A COMUNICAÇÃO COM O SERVIDOR
    statusDiv.innerHTML = '🤖 Analisando...';
    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8' 
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();

        if (result.success) {
            statusDiv.innerHTML = `✅ Análise concluída!`;
            statusDiv.classList.remove('loading');
            
            // Chama a função de formatação com os campos estruturados do novo backend
            resultadoTexto.innerHTML = formatAnalysisOutput(result.relatorio_alunos, result.resumo_e_metricas);
        } else {
            // Erro retornado pelo backend
            statusDiv.innerHTML = `❌ Erro na análise: ${result.error}`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = `Não foi possível obter a análise. Detalhes: ${result.error}`;
        }

    } catch (error) {
        // Erro de rede ou comunicação
        statusDiv.innerHTML = '❌ Erro de conexão com o servidor de análise.';
        statusDiv.classList.remove('loading');
        resultadoTexto.textContent = `Erro de rede: ${error.message}`;

    } finally {
        // Reabilitar o botão
        botao.disabled = false;
    }
}


// >> FUNÇÃO DE FORMATAÇÃO E RECALCULO (Simplificada para o novo formato de dados de entrada)
function formatAnalysisOutput(relatorio_alunos, resumo_e_metricas) { 
    let media = 'N/A';
    let maior = 'N/A';
    let menor = 'N/A';
    let totalQuestoes = 'N/A';
    let observacoesTexto = 'Nenhuma observação detalhada foi fornecida.';

    try {
        // O campo relatorio_alunos já é o ARRAY que queremos.
        if (!relatorio_alunos || relatorio_alunos.length === 0) {
            throw new Error("O relatório de alunos está vazio ou em formato inválido.");
        }
        
        // 1. EXTRAÇÃO DE OBSERVAÇÕES E MÉTRICAS DO TEXTO ÚNICO 'resumo_e_metricas'
        if (resumo_e_metricas) {
            // <<<< CORREÇÃO CRUCIAL DA REGEX AQUI >>>>
            // Regex mais flexível para capturar o bloco 'text' até o fechamento ```,
            // (.*?)\s*``` captura qualquer conteúdo até o fechamento ``` opcionalmente precedido por espaços/quebras de linha.
            const obsMatch = resumo_e_metricas.match(/```text\s*([\s\S]*?)\s*```/i);
            
            if (obsMatch && obsMatch[1]) {
                 // Remove o título "Observações Gerais:" que pode estar dentro do bloco de texto
                observacoesTexto = obsMatch[1].replace(/Observações Gerais:/i, '').trim();
            }
        }
        
        // 2. RECALCULAR MÉTRICAS (GARANTINDO 100% DE PRECISÃO)
        let totalAcertos = 0;
        let maiorPontuacao = 0;
        let menorPontuacao = Infinity; 

        // Define o total de questões baseado no primeiro aluno
        totalQuestoes = relatorio_alunos[0].Total_Questoes;
        relatorio_alunos.forEach(aluno => {
            // O uso de parseInt() no front-end é robusto para o campo Acertos
            const acertos = parseInt(aluno.Acertos, 10); 
            if (!isNaN(acertos)) {
                totalAcertos += acertos;
                maiorPontuacao = Math.max(maiorPontuacao, acertos);
                menorPontuacao = Math.min(menorPontuacao, acertos);
            }
        });

        // Calcula a média e formata para 2 casas decimais
        media = (totalAcertos / relatorio_alunos.length).toFixed(2);
        maior = maiorPontuacao;
        menor = menorPontuacao === Infinity ? 'N/A' : menorPontuacao;

        // 3. Monta o HTML final com os dados recalculados
        return formatHtmlOutput({
            relatorio_alunos,
            media: media.replace('.', ','), // Formata de volta para padrão brasileiro
            maior,
            menor,
            totalQuestoes,
            observacoesTexto
        });
    } catch (e) {
        console.error("Erro na Formatação/Recálculo do JSON:", e);
        // Retorna o erro capturado para exibição na página
        return '<h3>Erro ao processar os Dados de Resultados</h3><p>Ocorreu um erro ao tentar ler os dados detalhados. Detalhes do erro: ' + e.message + '</p>';
    }
}


// >> FUNÇÃO: Monta o HTML 
function formatHtmlOutput({ relatorio_alunos, media, maior, menor, totalQuestoes, observacoesTexto }) {
    
    // Processamento do texto de observações que agora vem limpo ou extraído do bloco ```text
    let obsTextoFinal = observacoesTexto;

    let htmlOutput = `
        <h4 style="margin-top: 5px; color: #6c757d; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
            Total de Questões Analisadas para o Relatório: <strong>${totalQuestoes}</strong>
        </h4>
        <h3>Relatório Detalhado por Aluno</h3>
        <hr>
    `;
// Formata o relatório por aluno
    relatorio_alunos.forEach(aluno => {
        // CORREÇÃO DE ROBUSTEZ: Usa o valor do backend, ou "0,00" se for null/undefined (para evitar o erro .replace)
        const percentualAcertoSeguro = aluno.Percentual_Acerto || "0,00"; 
        
        const percent = parseFloat(
