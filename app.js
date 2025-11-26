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
            // Linha ignorada
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


// >> FUNÇÃO DE FORMATAÇÃO E RECALCULO
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
        
        // 1. EXTRAÇÃO ROBUSTA DE OBSERVAÇÕES E MÉTRICAS DO TEXTO ÚNICO 'resumo_e_metricas'
        if (resumo_e_metricas) {
            let tempObsTexto = null;
            
            // TENTATIVA 1: O padrão mais robusto (```text até ```, sendo o fechamento opcional)
            const obsMatch = resumo_e_metricas.match(/```text\s*([\s\S]*?)(?:```)?\s*$/i);
            
            if (obsMatch && obsMatch[1]) {
                tempObsTexto = obsMatch[1];
            } else {
                // TENTATIVA 2: Se a primeira falhar, tenta achar a âncora "Observações Gerais:" e pega tudo depois
                const fallbackMatch1 = resumo_e_metricas.match(/Observações Gerais:\s*([\s\S]*)/i);
                
                if (fallbackMatch1 && fallbackMatch1[1]) {
                    // Remove qualquer formatação ``` que possa ter sobrado
                    tempObsTexto = fallbackMatch1[1].replace(/```text|```/ig, '');
                } else {
                    // TENTATIVA 3: Tenta achar ```text e pega tudo depois, sem se preocupar com o final
                    const fallbackMatch2 = resumo_e_metricas.match(/```text\s*([\s\S]*)/i);
                    if (fallbackMatch2 && fallbackMatch2[1]) {
                         tempObsTexto = fallbackMatch2[1];
                    }
                }
            }

            if (tempObsTexto) {
                // Limpa o texto final, removendo o título interno e espaços em branco
                observacoesTexto = tempObsTexto.replace(/Observações Gerais:/i, '').trim();
            }
        }
        
        // 2. RECALCULAR MÉTRICAS E PERCENTUAL DE CADA ALUNO (GARANTINDO 100% DE PRECISÃO)
        let totalAcertos = 0;
        let maiorPontuacao = 0;
        let menorPontuacao = Infinity; 
        
        // Define o total de questões (em número) baseado no primeiro aluno
        const totalQuestoesNum = parseInt(relatorio_alunos[0].Total_Questoes, 10);
        totalQuestoes = totalQuestoesNum.toString(); // mantém a string para exibição

        if (totalQuestoesNum === 0 || isNaN(totalQuestoesNum)) {
             throw new Error("Total de Questões inválido ou zero. Verifique o cabeçalho do CSV.");
        }

        relatorio_alunos.forEach(aluno => {
            const acertos = parseInt(aluno.Acertos, 10); 
            
            if (!isNaN(acertos)) {
                totalAcertos += acertos;
                maiorPontuacao = Math.max(maiorPontuacao, acertos);
                menorPontuacao = Math.min(menorPontuacao, acertos);
                
                // <<< CÁLCULO E SOBRESCRITA DO PERCENTUAL >>>
                const percentCalc = (acertos / totalQuestoesNum) * 100;
                // Formata com 2 casas decimais e usa vírgula como separador (padrão brasileiro)
                aluno.Percentual_Acerto = percentCalc.toFixed(2).replace('.', ',');
                // <<< FIM DO CÁLCULO >>>
            } else {
                // Garante que o Acertos seja '0' para cálculos se for inválido
                aluno.Acertos = '0';
                aluno.Percentual_Acerto = '0,00';
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
    
    // Calcula o total de alunos
    const totalAlunos = relatorio_alunos.length;
    
    // Processamento do texto de observações que agora vem limpo ou extraído do bloco ```text
    let obsTextoFinal = observacoesTexto;

    let htmlOutput = `
        <h4 style="margin-top: 5px; color: #6c757d; margin-bottom: 5px;">
            Total de Questões Analisadas para o Relatório: <strong>${totalQuestoes}</strong>
        </h4>
        <h4 style="color: #6c757d; border-bottom: 1px dashed #ccc; padding-bottom: 10px; margin-top: 5px;">
            Total de Alunos: <strong>${totalAlunos}</strong>
        </h4>
        
        <h3>Relatório Detalhado por Aluno</h3>
        <hr>
    `;
// Formata o relatório por aluno
    relatorio_alunos.forEach(aluno => {
        // CORREÇÃO DE ROBUSTEZ 1: Garante que Erros não seja 'undefined'
        const errosSeguro = aluno.Erros || 'N/A';
        // O Percentual_Acerto agora é garantidamente válido e calculado
        const percentualAcertoSeguro = aluno.Percentual_Acerto; 
        
        const percent = parseFloat(percentualAcertoSeguro.replace(',', '.')); // Chama replace em um valor seguro
        const color = percent >= 80 ? '#28a745' : percent >= 50 ? '#ffc107' : '#dc3545'; 

        htmlOutput += `
            <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 8px; background-color: #fff;">
           
            <h4 style="margin-top: 0; color: ${color};">${aluno.Aluno}</h4>
                <ul style="list-style-type: none; padding: 0;">
                    <li><strong>✅ Acertos:</strong> <span style="color: #28a745;">${aluno.Acertos}</span></li>
                    <li><strong>❌ Erros:</strong> <span style="color: #dc3545;">${errosSeguro}</span></li>
                    <li><strong>% de Acerto:</strong> 
            <strong style="color: ${color};">${percentualAcertoSeguro}%</strong></li>
                </ul>
            </div>
        `;
    });
    
    // Limpa o texto de observações e converte para HTML (para aceitar texto corrido ou bullet points)
    let observacoesHtml = obsTextoFinal
        .replace(/^(<br>|\s)+/g, '') // Remove quebras de linha no início
        .replace(/\*/g, '•') // Converte * em •
        .replace(/\n/g, '<br>') // Converte \n em <br>
        .trim();
    htmlOutput += `
        <br>
        <h3>Análise Geral de Desempenho da Turma</h3>
        
        <div style="border: 1px solid #007bff; padding: 20px; border-radius: 8px; background-color: #eaf5ff;">
            <h4 style="color: #007bff; margin-top: 0; border-bottom: 1px solid #007bff; padding-bottom: 10px;">
                Resumo Executivo da Turma
          
            </h4>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
                
                <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
                 
                <strong style="color: #007bff;">Média de Acertos</strong>
                    <h4 style="margin: 0; color: #007bff;">${media} Acertos</h4>
                </div>
                
                <div style="background-color: #fff; padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #28a745;">Maior Pontuação</strong>
                    <h4 style="margin: 0;
            color: #28a745;">${maior} Acertos</h4>
                </div>
                
                <div style="background-color: #fff;
            padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: flex; justify-content: space-between;
            align-items: center;">
                    <strong style="color: #dc3545;">Menor Pontuação</strong>
                    <h4 style="margin: 0;
            color: #dc3545;">${menor} Acertos</h4>
                </div>
            </div>

            <div style="background-color: #fff;
            padding: 15px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                <strong style="display: block;
            margin-bottom: 8px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px;">Relatório de Desempenho (Observações Gerais):</strong>
                <div style="padding-left: 5px;
            color: #555;">
                    ${observacoesHtml}
                </div>
            </div>

        </div>
    `;
    
    return htmlOutput;
}
