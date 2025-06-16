  // définition de la fonction qui charge le modele de regression
export async function loadMLPModel() {
  try {
    const res = await fetch("/mlp_model");
    mlpModel = await res.json();
    console.log("modele MLP chargé");
  } catch (err) {
    console.error("erreur de chargement du modele MLP", err);
  }
}
