# BOSS KEY — Roteiro do teste com pessoas

Os robôs dizem se o jogo **funciona** e dão uma ideia do balanço. Se ele é **divertido** e se dá para **entender sem ajuda**, só gente jogando responde. Este roteiro serve para tirar o máximo de cada pessoa.

## Antes

1. Rode `npm run verify` (~6 min). Se algo falhar, não chame ninguém ainda.
2. Escolha como a pessoa vai jogar:
   - **No seu PC:** `npm run dev` e abra o endereço que aparece.
   - **No PC dela:** gere o pacote com `npm run dist:win` e mande o .zip.
   - **Multi:** a sala Steam precisa da Steam aberta nos dois PCs.
3. Grave a tela e o áudio (OBS ou a Barra de Jogo do Windows, `Win+G`). Os 5 primeiros minutos são os mais valiosos.
4. Fones de ouvido: a porta e os passos do chefe fazem parte da mecânica.

## Durante (não explique o jogo)

Diga só isto: *"É um jogo de escritório. Você quer se divertir sem o chefe perceber. Pense em voz alta."* Depois fique quieto. Quando a pessoa travar, conte até 20 antes de ajudar e **anote onde travou**.

**Sessão sugerida:** 1 run solo até acabar (15–25 min). Se der, uma run em dupla.

### O que anotar (marque o minuto do vídeo)

| Pergunta | Sinal de que funciona | Sinal de problema |
|---|---|---|
| Entendeu disfarçado × exposto? | Volta para a mesa quando a porta abre; usa a tarefa do chefe para andar. | Fica parado no PC jogando, ou passeia sem motivo e não entende o "à toa". |
| Percebe o chefe chegando? | Reage à porta ou aos passos antes de ele aparecer. | Só reage quando o chefe já está atrás da cadeira. |
| Faz clutch? | Fecha o jogo no batimento cardíaco, com o chefe atrás, e ri. | Nunca deixa o chefe chegar, ou não liga o batimento ao perigo. |
| Entende a Suspeita? | Lê os "+N motivo" e muda o comportamento. | Diz "subiu do nada", "não sei por que fui demitido". |
| A meta de FUN puxa para o risco? | Arrisca no fim do dia para bater a meta. | Fica só no PC, perde vida por tédio sem entender. |
| Usa o hall e a loja? | Compra algo e comenta o efeito. | Passa direto pela porta da rua, ou não entende o Vale. |
| Planeja a missão do dia (v0.9)? | Lê a agenda no quadro, combina "você vigia, eu pego", escolhe a hora. | Só espera o chefe sair sozinho, ou nem lê a agenda. |
| Cria a brecha? | Trava a impressora, liga o rádio ou puxa o alarme *para* entrar na sala. | Não descobre as distrações, ou usa sem objetivo. |
| O item na mão dá tensão boa? | Corre para o armário, passa para o colega no susto e ri. | Some o item sem entender por quê; acha a perseguição injusta. |
| Aquário a dois funciona? | Os dois andam juntos rindo; alguém derrama e todos gritam. | Brigam com a mola, ou ninguém percebe que precisa de dois. |
| Cota × missão (v0.10)? | Trabalha com o chefe na sala e vai para a missão na ausência longa da agenda. | Faz tudo na mesma ordem todo dia, ou perde vida pela cota sem entender por quê. |
| Minigames divertem? | Ri ou xinga no painel (fios, fechadura, pôster); larga com Q quando a porta abre. | Acha repetitivo, ou não percebe que pode sair com Q. |
| Papo com o chefe? | Usa o papo para segurar o chefe (no multi: "eu distraio, você rouba"). | Nunca descobre o papo, ou não entende de onde vêm os segundos. |
| Vigilância é justa? | Espera o verde da câmera; desliga o sensor; procura o código. | Diz "do nada a câmera me pegou" ou "não sabia do sensor". |
| O tutorial do dia 1 ajuda? | Senta, faz a cota e abre um jogo sem perguntar. | Lê o cartão e não sabe o que fazer; o texto cobre algo importante. |

Também vale anotar: frases espontâneas ("ah não!", "kkk", "que injusto"), momentos de tédio (olhar o celular) e qualquer travamento ou erro visual.

## Depois (5 minutos, nesta ordem)

1. "Me conta o que acontece nesse jogo." (Se a pessoa descrever o loop sem falar de planilha, ótimo.)
2. "Qual foi o melhor momento? E o pior?"
3. "Alguma vez você achou que o jogo foi injusto?"
4. "O que a loja/os itens faziam?"
4b. (v0.9) "Vocês planejaram antes de agir? Quem fez o quê na missão?" e "Qual missão foi mais legal, e por quê?"
5. "Jogaria de novo? Com quem?"
6. De 1 a 5: diversão, clareza, vontade de jogar de novo.

## Coleta

- No fim da run, clique em **Salvar relatório**. Sai um `bosskey-run-<data>.json` com cada dia: chefia, eventos, FUN e meta, vidas perdidas, motivo da demissão, Suspeita por motivo, tarefas, diversões, Vale e itens.
- Junte o .json, o vídeo e as anotações numa pasta por pessoa (`testes/2026-11-xx-nome/`).

## O que os robôs já disseram (hipóteses para confirmar)

As hipóteses saem de `docs/PLAYTEST.md` e de `tools/playtest/out/`.

- Os primeiros minutos funcionam: o FUN chega rápido e o aviso da porta vem com folga (mediana de 14–17 s).
- O cauteloso e o arriscado fazem placares parecidos. Gente pode jogar muito diferente dos robôs, então confira quem arrisca e quanto isso compensa.
- O clutch é raro nos robôs. Confira se as pessoas percebem o batimento como o sinal de fechar o jogo.
- O dia de "Ronda do X9" era o mais duro: a ronda ficou mais curta em 30/10. Confira se ainda pesa.
- O assalto funciona, mas os robôs desistem quando o chefe volta. Confira se as pessoas tentam e se o prêmio parece valer o risco.

## Depois de 3–5 pessoas

Junte os achados por pergunta da tabela. Só mexa em números (`src/balance.ts`) depois de ver o mesmo problema em pelo menos 2 pessoas, e rode `npm test` depois: o teste avisa se o GDD ficou desatualizado.
