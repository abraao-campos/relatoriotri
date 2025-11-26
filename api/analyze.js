const jsonMatch = jsonString.match(/```json\n([\s\S]*)\n```/);
            if (jsonMatch) {
                jsonString = jsonMatch[1].trim();
            }

            // O Gemini, com responseMimeType: application/json, às vezes envia apenas o JSON limpo.
            let relatorioParcial;
            try {
                relatorioParcial = JSON.parse(jsonString);
            } catch (jsonError) {
                console.error("Erro ao parsear JSON:", jsonError, "Resposta bruta:", fullText);
                throw new Error(`A API do Gemini retornou um formato inválido de JSON no Lote ${i + 1}.`);
            }
            
            // O restante da lógica de extração das métricas/observações permanece inalterada
            // Como usamos responseMimeType, o Gemini DEVE retornar apenas o JSON.
            // A observação textual será ignorada por este handler forçando o JSON, 
            // e será adicionada ao prompt do segundo lote se necessário, ou em uma chamada separada se o lote for único.

            // Para simplificar, vou assumir que faremos UMA chamada para o Gemini com TODOS os dados
            // e que o chunking só é necessário para a observação final, o que não é o caso aqui.

            // VOU REVERTER PARA UMA ÚNICA CHAMADA SEM CHUNKING PARA SIMPLICIDADE E EFICIÊNCIA
            // se o número de alunos for <= 100. Se for maior, o chunking exige lógica de agregação complexa que vou evitar.

            // VAMOS REVERTER O PLANO DE CHUNKING PARA SIMPLIFICAR E ATENDER A MAIORIA DOS CASOS (até 100 alunos)

            if (chunksAlunos.length > 1) {
                throw new Error("O sistema de análise por lotes é complexo e foi desativado temporariamente. O limite é de 100 alunos. Por favor, divida o arquivo CSV.");
            }

            // Se for um único lote, o relatorioFinalDetalhado é o relatorioParcial.
            relatorioFinalDetalhado = relatorioParcial;

            // Para a observação, faremos uma chamada SEPARADA para garantir que o JSON seja limpo.
            const observacaoPrompt = `Com base na análise JSON que você acabou de gerar (não a repita), forneça uma observação concisa, em 1-2 parágrafos, sobre os principais pontos fracos e fortes da turma (média, desvio, questões mais difíceis, distratores).
            
Dados de Acertos (Nome (Acertos/Total)): ${alunosData}
Métricas Chave: Média ${media.toFixed(2)}, Maior ${maior}, Menor ${menor}`;

            const observacaoResponse = await ai.models.generateContent({
                model: MODEL_NAME,
                contents: [{ parts: [{ text: observacaoPrompt }] }],
                config: {
                    temperature: 0.5,
                    systemInstruction: {
                        parts: [{ text: "Você é um analista educacional. Sua única tarefa é escrever uma observação coesa em 1-2 parágrafos. Sua resposta não deve conter o bloco JSON nem formatação (markdown) além de quebras de linha." }]
                    }
                }
            });

            const observacaoText = observacaoResponse.text;
            relatoriosObservacoes.push(observacaoText);
        }

        // --- 5. Montagem da Resposta Final ---
        
        // Converte o JSON final de volta para o formato de string Markdown que o frontend espera.
        const relatorioJSONCompleto = `\`\`\`json\n${JSON.stringify(relatorioFinalDetalhado, null, 2)}\n\`\`\``;
        
        // Concatena o JSON e as observações textuais
        const relatorioFinalCompleto = relatorioJSONCompleto + "\n\n" + relatoriosObservacoes.join('\n');

        // Retorna a resposta de sucesso com status 200
        return res.status(200).json({
            success: true,
            analysis: relatorioFinalCompleto, 
            error: null 
        });

    } catch (e) {
        // Captura qualquer erro não tratado e formata como JSON de erro
        
        const statusCode = (e.message.includes("não contém dados") || e.message.includes("CSV deve ter o Gabarito") || e.message.includes("não está definida")) ? 400 : 500;

        console.error(`ERRO CRÍTICO NO HANDLER (Status ${statusCode}):`, e.message);

        return res.status(statusCode).json({
            success: false,
            analysis: null, 
            error: e.message
        });
    }
};
