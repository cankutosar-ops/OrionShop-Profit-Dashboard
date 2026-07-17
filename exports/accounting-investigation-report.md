# Accounting Investigation Report

Generated: 2026-07-11T10:39:28.248Z
Source: `C:\Projects\OrionShop-Profit-Dashboard\exports\accounting-reconciliation.json`

## Dataset summary

| Metric | Value |
| --- | ---: |
| Unique SRID records | 1821 |
| Total finance rows | 2687 |
| Finance rows without SRID | 6 |
| SRID records with 0 finance rows | 361 |

> Statistical summaries only. No profit calculations. Attachment = order/sale present on the SRID record.

## 1. Distribution of finance rows per SRID

- **0 finance rows**: 361 SRIDs
- **1 finance row**: 942 SRIDs
- **2 finance rows**: 89 SRIDs
- **3 finance rows**: 186 SRIDs
- **4 finance rows**: 221 SRIDs
- **5 finance rows**: 13 SRIDs
- **6 finance rows**: 9 SRIDs

## 2. Distribution of finance `supplier_oper_name`

| Operation type | Row count |
| --- | ---: |
| Возмещение издержек по перевозке/по складским операциям с товаром | 1585 |
| Логистика | 894 |
| Продажа | 93 |
| Возмещение за выдачу и возврат товаров на ПВЗ | 73 |
| Возврат | 28 |
| Хранение | 12 |
| Удержание | 2 |

## 3. Operation type attachment breakdown

| Operation type | Total rows | With sale | With order | Finance-only |
| --- | ---: | ---: | ---: | ---: |
| Возмещение издержек по перевозке/по складским операциям с товаром | 1585 | 96 | 543 | 1009 |
| Логистика | 894 | 121 | 684 | 169 |
| Продажа | 93 | 93 | 65 | 0 |
| Возмещение за выдачу и возврат товаров на ПВЗ | 73 | 3 | 4 | 69 |
| Возврат | 28 | 28 | 15 | 0 |
| Хранение | 12 | 0 | 0 | 12 |
| Удержание | 2 | 0 | 0 | 2 |

## 4. Top 50 SRIDs by finance event count

| Rank | SRID | Finance events | Has order | Has sale |
| ---: | --- | ---: | --- | --- |
| 1 | `eA7.r3856ecb992b6499e9a7c0accada975a9.0.0` | 6 | yes | yes |
| 2 | `eAQ.i603b704f5c59cb1ea1f767e87b5f58be.0.0` | 6 | no | yes |
| 3 | `eB.r6cda524f35dd4f4791afbcea90007144.5.0` | 6 | yes | yes |
| 4 | `eB8.i84e19efdd2bb89b5b06435a323b2850a.0.0` | 6 | no | yes |
| 5 | `eB8.r1d97e1ce7b114daf804dc6fb065526a6.0.0` | 6 | yes | yes |
| 6 | `eBA.r1e550ca2355a417e9e47d333d08fe2ba.0.0` | 6 | yes | yes |
| 7 | `ebP.r5c257db0939d46c9b1fb1bed7be3f236.0.0` | 6 | yes | yes |
| 8 | `eI.i01e576f0aa71ccb201af3f513797f8ba.0.0` | 6 | no | yes |
| 9 | `eI.ra7b26787e90b448899fd1a0e302d7494.12.0` | 6 | yes | yes |
| 10 | `eA1.i720b9ff6b19fed5e14a36fbce0999e6f.0.0` | 5 | no | no |
| 11 | `eA9.r92f7c8b9c26a4fcabb38762f8ad5a5b8.0.0` | 5 | yes | yes |
| 12 | `eAr.58175c4a1ef8481fb9736e5ea18fa0a7.0.0` | 5 | yes | yes |
| 13 | `eAR.rc7a151afe81e4daf976ee4978a665766.0.0` | 5 | yes | yes |
| 14 | `eb0.r00f5bb4e10804c3f98b165cdb62a6bed.0.0` | 5 | yes | yes |
| 15 | `eB8.rae865bcc5c894dae99dda0c45ab52f81.0.0` | 5 | yes | no |
| 16 | `eB8.ree30409e7fc046f7a3ebbec2d2b40ebe.0.0` | 5 | yes | no |
| 17 | `eBu.r11f655b0f62949caac4d38360ecf7a14.0.0` | 5 | yes | yes |
| 18 | `eE.r8ee56088f899411eac51910578e59523.0.0` | 5 | no | yes |
| 19 | `eF.i37ec4dba48b3207f66ce97c7706488d4.0.0` | 5 | yes | yes |
| 20 | `eM.r5081e629b7b6463badfeefcf8a0aedfa.0.0` | 5 | yes | no |
| 21 | `eQ.r303602cfb5c5443a91a9f0fd5f5c2eec.0.0` | 5 | yes | yes |
| 22 | `eY.92d97229620940798c955b54492a7f44.8.0` | 5 | no | no |
| 23 | `104236795625959016.0.0` | 4 | yes | no |
| 24 | `5031535133234112968.0.0` | 4 | yes | no |
| 25 | `766e4a17d86b4b34b30b9a8491dcd54e` | 4 | no | no |
| 26 | `9092208665100118424.0.0` | 4 | yes | no |
| 27 | `e0.rec9a41017d8d41f8bb34c661e50987db.0.0` | 4 | no | no |
| 28 | `e3.i01de4072169319dfe3a3cfc4f156ae50.5.0` | 4 | yes | no |
| 29 | `e3.i4b86a3ed8122b22d43024303d2513a15.1.0` | 4 | yes | no |
| 30 | `e3.raea2a646fb7a4a92ae299511a32fdd23.0.0` | 4 | yes | no |
| 31 | `e5.idfadd0ec088bdd6f20601b3ac17152cd.0.0` | 4 | yes | no |
| 32 | `e5.r3c56d145840f4d058f47e1162e1eb710.0.0` | 4 | no | no |
| 33 | `e8.recccb72501854e0ca56acbdc185307f9.0.0` | 4 | yes | no |
| 34 | `e9.r6039675330194cf5811b3878d987a85a.0.0` | 4 | yes | no |
| 35 | `e9.r9d6623d49c3346e48fe3ba0172edf33f.0.0` | 4 | yes | no |
| 36 | `eA.r07af665a1b09449ea1c5124dbdbe07ac.0.0` | 4 | yes | no |
| 37 | `eA.re92ac5907ada4750b1e35b9a83301b42.0.0` | 4 | yes | no |
| 38 | `eA1.r94bd41c61371482c8c5543421bc9ce36.0.0` | 4 | yes | no |
| 39 | `eA2.r02030b2d0aa841728591f777f8f59c67.0.0` | 4 | yes | no |
| 40 | `eA2.r3cef6bf2fc864623bd18d575c096d4a1.0.0` | 4 | yes | no |
| 41 | `eA2.rcfdf9f4bc9874d63be6939a5e8428ee5.0.0` | 4 | yes | no |
| 42 | `eA3.r1c823efce2774986a5cabf7bbd58281a.0.0` | 4 | yes | no |
| 43 | `eA4.ie3b25e82e2c3ac59a1f5cd1400e9ee47.0.0` | 4 | yes | no |
| 44 | `eA4.ie687c9b319f25c351645f81db3b95e78.0.0` | 4 | yes | no |
| 45 | `eA8.r81f3244483984187b9f62e51297d46cd.2.0` | 4 | yes | no |
| 46 | `eA9.r57ea30cea34c4a7db7de82a259361258.0.0` | 4 | no | no |
| 47 | `eA9.rbc24c4d4519e4557b648b136ba6c7777.0.0` | 4 | no | no |
| 48 | `eAB.i20b2de00291829493643f62347e74e5d.0.0` | 4 | yes | no |
| 49 | `eAB.i97810b12b3cb3e8f6b76bdde0cce9221.0.0` | 4 | yes | no |
| 50 | `eAB.r960bada91fc74268a0919ac8e2653339.0.0` | 4 | yes | yes |

## 5. Example SRIDs by finance row count

### 1 row (20 examples)

- `1005385`
- `1034322`
- `10544426`
- `1103298`
- `1103299`
- `1110632`
- `1110633`
- `1110634`
- `1110635`
- `1110636`
- `115397`
- `1186377`
- `1187464`
- `1187465`
- `1187466`
- `1187467`
- `1187468`
- `1187469`
- `1187470`
- `1187471`

### 2 rows (20 examples)

- `7731544500256587797.0.0`
- `79590740626168596.0.0`
- `e0.raf3ad0eaf15743c59a3ba9a26c1b5378.0.0`
- `e2.rcbddf346525340eab12e9435a7c66eb2.0.0`
- `e35def307c0641d7a659447b3475a10a`
- `e9.r17ae90b7b00f47fa81c8f7bfac809740.0.0`
- `eAI.r0056243597db42e4b7e09679c68d80ea.0.0`
- `eAM.r9d94fca4a7be4dd89a51453e2f097608.5.0`
- `eAP.re8560a3a5a1641729b0e927301281e69.0.0`
- `eAS.r139e82a7c4c940dc88d1c56d1a04ccfd.0.0`
- `eAS.r412cdcd4d1c14ee791876b6cc802f728.0.0`
- `eAT.ia2d02e0041b43792c13c256ad416be7b.0.0`
- `eAU.r002a7e2daa42450483996710d836dc88.0.0`
- `eAe.57391019a5064752b5b41d18621950e5.0.0`
- `eAh.r79d3cb207de54be787cfbd9f0b970ebb.0.0`
- `eAj.r1464c84048404add83c79d8ea53a6ae5.0.0`
- `eAm.i30e47222f7c5c0b1ce1e87e2c3faaba0.0.0`
- `eAp.r34036a276ef14e84bb0659acbf5ec2dd.0.0`
- `eAr.rca7076586a15483aa4e18fa633796380.0.0`
- `eAy.i686dca012f2177ac318dd8e906ad4d93.0.0`

### 3 rows (20 examples)

- `4713081828977071336.0.0`
- `5339795859873137020.0.0`
- `7643152773157854058.0.0`
- `e1.rb36103ab03af4d0eb571046a8f32c5a8.0.0`
- `e1.rccdd134f1be04ecb9b76839f92d24a34.0.0`
- `e4.ra0bcc5014b49402a931572d0d3225df8.0.0`
- `e8.r70c53dab43d9457eb9e197ef8d6a25d8.0.0`
- `e8.rb497425ab86440c0a064246b1d2c0391.0.0`
- `e9.re3748dbf8c4d41c09891c35ed0f27bbf.0.0`
- `e9.rfaba8c5e94834ae6ba9a988de40f590d.0.0`
- `eA1.r7e0076f6c2dc480db1b7bda191deef31.0.0`
- `eA2.r0083bf2887434382909b5e78f8ab6679.0.0`
- `eA5.ib0fd79280f6d66c5f0ac0b920194e1bf.0.0`
- `eA9.r95835f5e1079409f9193636091fd3e78.0.0`
- `eA9.rdf7883e5448e41499d28c0b66847990e.0.0`
- `eAA.r35dd5da9c8324d78a45775a3c5bc5acc.0.0`
- `eAA.r468ccde94817497aa0c87269052895fe.0.0`
- `eAE.r7dfcabc68d3c497cb91cafe5cbfc12fa.0.0`
- `eAH.reb401e95657b4aafac013b1854cbc2fc.1.0`
- `eAH.reb401e95657b4aafac013b1854cbc2fc.4.0`

### 4 rows (20 examples)

- `104236795625959016.0.0`
- `5031535133234112968.0.0`
- `766e4a17d86b4b34b30b9a8491dcd54e`
- `9092208665100118424.0.0`
- `e0.rec9a41017d8d41f8bb34c661e50987db.0.0`
- `e3.i01de4072169319dfe3a3cfc4f156ae50.5.0`
- `e3.i4b86a3ed8122b22d43024303d2513a15.1.0`
- `e3.raea2a646fb7a4a92ae299511a32fdd23.0.0`
- `e5.idfadd0ec088bdd6f20601b3ac17152cd.0.0`
- `e5.r3c56d145840f4d058f47e1162e1eb710.0.0`
- `e8.recccb72501854e0ca56acbdc185307f9.0.0`
- `e9.r6039675330194cf5811b3878d987a85a.0.0`
- `e9.r9d6623d49c3346e48fe3ba0172edf33f.0.0`
- `eA.r07af665a1b09449ea1c5124dbdbe07ac.0.0`
- `eA.re92ac5907ada4750b1e35b9a83301b42.0.0`
- `eA1.r94bd41c61371482c8c5543421bc9ce36.0.0`
- `eA2.r02030b2d0aa841728591f777f8f59c67.0.0`
- `eA2.r3cef6bf2fc864623bd18d575c096d4a1.0.0`
- `eA2.rcfdf9f4bc9874d63be6939a5e8428ee5.0.0`
- `eA3.r1c823efce2774986a5cabf7bbd58281a.0.0`

### 5+ rows (20 examples)

- `eA1.i720b9ff6b19fed5e14a36fbce0999e6f.0.0`
- `eA7.r3856ecb992b6499e9a7c0accada975a9.0.0`
- `eA9.r92f7c8b9c26a4fcabb38762f8ad5a5b8.0.0`
- `eAQ.i603b704f5c59cb1ea1f767e87b5f58be.0.0`
- `eAR.rc7a151afe81e4daf976ee4978a665766.0.0`
- `eAr.58175c4a1ef8481fb9736e5ea18fa0a7.0.0`
- `eB.r6cda524f35dd4f4791afbcea90007144.5.0`
- `eB8.i84e19efdd2bb89b5b06435a323b2850a.0.0`
- `eB8.r1d97e1ce7b114daf804dc6fb065526a6.0.0`
- `eB8.rae865bcc5c894dae99dda0c45ab52f81.0.0`
- `eB8.ree30409e7fc046f7a3ebbec2d2b40ebe.0.0`
- `eBA.r1e550ca2355a417e9e47d333d08fe2ba.0.0`
- `eBu.r11f655b0f62949caac4d38360ecf7a14.0.0`
- `eE.r8ee56088f899411eac51910578e59523.0.0`
- `eF.i37ec4dba48b3207f66ce97c7706488d4.0.0`
- `eI.i01e576f0aa71ccb201af3f513797f8ba.0.0`
- `eI.ra7b26787e90b448899fd1a0e302d7494.12.0`
- `eM.r5081e629b7b6463badfeefcf8a0aedfa.0.0`
- `eQ.r303602cfb5c5443a91a9f0fd5f5c2eec.0.0`
- `eY.92d97229620940798c955b54492a7f44.8.0`
