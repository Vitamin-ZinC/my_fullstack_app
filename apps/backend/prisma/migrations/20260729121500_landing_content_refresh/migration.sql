UPDATE "AppSetting"
SET "value" = "value"
  #- '{landing,signalsTitle}'
  #- '{landing,freeTitle}'
  #- '{landing,modelTitle}'
  #- '{landing,privacyTitle}'
  #- '{landing,finalTitle}'
  #- '{landing,diagnosisProduct,items}'
  #- '{flow,voice,title}'
  #- '{flow,voice,copy}'
  #- '{flow,voice,start}'
  #- '{flow,voice,stop}'
  #- '{flow,voice,instructions}'
  #- '{flow,face,title}'
  #- '{flow,face,openCamera}'
  #- '{report,full,sections}'
WHERE "key" = 'site_texts_ru'
  AND jsonb_typeof("value") = 'object';
