export const CONFIG = {
  region: "us-east-1",
  apiBaseUrl: "REPLACE_IN_TASK_5",
  cognito: {
    userPoolId: "us-east-1_gI0tvTNia",   
    clientId: "44at0h3bhp70n3dkm289332tni", 
  },
  imagesBucketUrl: "https://foodbridge-images-srikar.s3.us-east-1.amazonaws.com",
  map: { center: [13.0827, 80.2707], zoom: 12 }, // Chennai
  impact: { mealsPerKg: 2.5, co2PerKg: 2.5 },
};