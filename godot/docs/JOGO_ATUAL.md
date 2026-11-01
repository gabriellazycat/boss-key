# O jogo web atual (three.js), como ele realmente funciona

Fonte: leitura do código em `src/` em 01/11/2026, não o GDD. Este resumo guia o remake em Godot.

## O que o jogo atual faz de fato

**Run e dia**
- 3 vidas; o dia tem 300 s (09h–18h).
- Perde vida quem é demitido (Suspeita em 100) ou quem termina o dia abaixo da meta de FUN.
- **A cota de trabalho é só cosmética**: não bater não custa nada (`Game.ts:4229`).

**Manhã e elevador**
- Hall → cabine → **teleporte** de 40 m para uma cabine idêntica no andar.
- O briefing do chefe dura 19 s; ESPAÇO pula a partir do dia 2.
- Às 18h desce, de novo por teleporte. À noite: lojinha (5 ofertas) + balcão de upgrades.

**Chefe**
- Agenda de 5–7 compromissos, com uma ausência longa no meio do dia.
- Visão: 70°, 12 m. Identifica a tela pelas costas em 0,5 s.
- Persegue quem vê à toa ou com item. Sentar com a tela de trabalho escapa.
- Aviso de no mínimo 6 s: porta, faixa "CHEFE EM RONDA", passos.

**Suspeita e clutch**
- Suspeita: leve 3/s, média 8/s, grave 15/s, dobrando a cada 1,5 s de visão contínua.
- Muitas fontes pontuais (+5 a +40).
- Clutch: trocar para o trabalho nos últimos 0,5 s antes de ele identificar.

**PC, missões e paineis**
- Apps do PC: planilha de ritmo, Trabalho (totais, e-mails, slides, triagem), Ball Ops, Pesca Zen, ClipClop e Objetivos.
- 7 missões grandes: grampeador, aquário, papel de parede, salgadinho, campeonato, relógio, pôsteres. Mais 2 pequenas por dia.
- 12 tipos de painel: fios, revirar, fechadura, digitar, arrastar, ritmo, sintonizar, alavanca, balcão, ponteiros, pôster, comer.
- Vigilância (câmeras, sensor, fechadura) e 7 truques do chefe a partir do dia 3.
- Distrações: impressora, rádio, viva-voz e alarme de incêndio. Esconderijo no banheiro.

**Visual**
- Paleta creme, madeira, azul-petróleo, laranja e amarelo; luz que muda ao longo do dia (fria → dourada → laranja → roxa).
- A luz da mesa muda de cor conforme o app aberto.
- **Telinha:** cabeça de monitor CRT, rosto pixel com scanlines. O chefe tem monitor widescreen cinza.
- Pego = tela azul com ":(".

## O que está quebrado ou confuso no jogo atual (o remake resolve por desenho)
1. Ball Ops e ClipClop nunca destravam. A missão "Campeonato de Ball Ops" é impossível.
2. Tarefas do telefone estão mortas, mas a ajuda e o HUD ainda falam delas ("aperte T").
3. "Diversão de hoje" não filtra nada; as mensagens dizem o contrário.
4. A cota não pesa → o jogador não tem motivo para trabalhar além de se proteger.
5. O 1º dia diz que não gasta vida, mas gasta.
6. O app Objetivos abre sozinho como janela proibida → o jogador fica exposto sem ter feito nada.
7. Sistemas demais competindo pela atenção: papo, casaco, supervisão, clientes, X9, eventos, truques, vigilância, pauta…

## Decisões do remake a partir deste mapa
- **Duas barras que importam** no fim do dia: Trabalho (cota do time) e FUN (meta). Cada uma não batida = 1 strike; demissão = 1 strike; 3 strikes = fim. O 1º dia é treino de verdade (não custa strike).
- **Todos os apps sempre liberados**; nada de "não é diversão de hoje".
- **Chefe legível:** agenda pública no quadro, lâmpada "NA RONDA", porta e passos. Persegue quem vê com item do assalto ou dentro da sala dele; sentar com o trabalho na tela despista.
- **Elevador de verdade:** a cabine viaja (portas, números do andar, tremida). A troca de andar acontece com a porta fechada, sem parecer teleporte.
- **Ficam:** clutch, assaltos em etapas com painéis, loja/upgrades, Telinha, luz que muda com o dia, cor da luz da mesa pelo app, tela azul ":(" ao ser demitido.
- **Cortados** (voltam se sobrar orçamento): papo, casaco, supervisão, clientes, X9, eventos, truques, ClipClop.
