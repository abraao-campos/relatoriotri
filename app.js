// URL da sua função serverless.
// Se você usar Vercel ou Netlify, o caminho será /api/analyze
const BACKEND_URL = '/api/analyze'; 

document.getElementById('analiseForm').addEventListener('submit', function(e) {
    e.preventDefault(); // Impede o envio tradicional do formulário
    
    const arquivoInput = document.getElementById('arquivoResultados');
    const statusDiv = document.getElementById('status');
    const resultadoTexto = document.getElementById('resultadoTexto');

    // 1. Verificação básica do arquivo
    if (arquivoInput.files.length === 0) {
        alert("Por favor, selecione um arquivo.");
        return;
    }

    const arquivo = arquivoInput.files[0];
    const reader = new FileReader();

    // Quando o arquivo é lido com sucesso, ele prepara e envia os dados
    reader.onload = function(event) {
        const fileContent = event.target.result;
        
        // Dados a serem enviados para o backend
        const dadosParaEnvio = {
            content: fileContent, // O conteúdo completo do arquivo (string)
            filename: arquivo.name,
            filetype: arquivo.type
        };

        // Envia os dados para o backend
        sendToBackend(dadosParaEnvio);
    };

    // Função para tratar erros de leitura
    reader.onerror = function(event) {
        statusDiv.innerHTML = `❌ Erro ao ler o arquivo: ${event.target.error.name}`;
        statusDiv.style.display = 'block';
    };

    // 2. Lê o arquivo como texto (para CSV, JSON, TXT)
    reader.readAsText(arquivo);

    // Indicador de Carregamento (início do processo de leitura)
    statusDiv.innerHTML = '⏳ Lendo e enviando arquivo para análise...';
    statusDiv.style.display = 'block';
    resultadoTexto.textContent = 'A análise está sendo processada pelo Gemini. Por favor, aguarde...';
});


// Função responsável pela comunicação com o Backend Serverless
async function sendToBackend(data) {
    const statusDiv = document.getElementById('status');
    const botao = document.getElementById('botaoAnalisar');
    const resultadoTexto = document.getElementById('resultadoTexto');

    // Desabilitar o botão e mostrar status de carregamento
    botao.disabled = true;
    statusDiv.innerHTML = '🚀 Enviando dados e aguardando resposta do Gemini...';
    statusDiv.classList.add('loading');
    
    try {
        // 3. Faz a requisição HTTP POST para a função serverless
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Sucesso na análise
            statusDiv.innerHTML = `✅ Análise concluída para o arquivo: ${result.filename}!`;
            statusDiv.classList.remove('loading');
            resultadoTexto.textContent = result.analysis;
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